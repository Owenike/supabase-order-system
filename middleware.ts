// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const config = {
  matcher: [
    // 套用到站內所有路徑，但排除常見的靜態資源與 Next/Vercel 系統路徑
    '/((?!_next/|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons/|images/|static/).*)',
  ],
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl
  const { pathname } = url

  // ✅ 略過 OAuth/授權回跳頁與過期提示頁，避免干擾或迴圈
  if (
    pathname.startsWith('/order') ||
    pathname.startsWith('/line-success') ||
    pathname.startsWith('/expired')
  ) {
    return NextResponse.next()
  }

  // ✅ 將 olinex.app 強制 308 轉址到 www.olinex.app
  if (url.hostname === 'olinex.app') {
    const to = url.clone()
    to.hostname = 'www.olinex.app'
    return NextResponse.redirect(to, 308)
  }

  // ======【到期導向邏輯】======
  // 設計：僅在「店家後台」路徑才強制檢查是否到期（/store/*）
  // 理由：/admin/* 由管理員使用，通常需要能查看所有店家，即使店家已到期也不應被擋住。
  if (pathname.startsWith('/store')) {
    try {
      const supabase = createClient(
        // 使用 Server Role 讀取資料；務必確認環境變數已設定
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // 從 cookie 取得 Supabase 的 access token（@supabase/auth-js 預設名）
      const accessToken = req.cookies.get('sb-access-token')?.value
      if (!accessToken) {
        // 未登入就先放行（你的頁面本身可能會再做 auth 保護/導回登入）
        return NextResponse.next()
      }

      // 以 access token 取得當前使用者
      const { data: userRes, error: userErr } = await supabase.auth.getUser(accessToken)
      if (userErr || !userRes?.user) return NextResponse.next()

      const user = userRes.user

      // 由使用者 Email 找所屬店家（若一人綁多店，可擴充為 in 查詢或以 store_id cookie/qs 指定）
      const { data: link } = await supabase
        .from('store_user_links')
        .select('store_id')
        .eq('email', user.email)
        .maybeSingle()

      if (!link?.store_id) return NextResponse.next()

      // 讀取店家的試用期限與啟用狀態
      const { data: store } = await supabase
        .from('stores')
        .select('trial_end_at, is_active')
        .eq('id', link.store_id)
        .maybeSingle()

      if (!store?.trial_end_at) return NextResponse.next()

      const expired = Date.now() > new Date(store.trial_end_at).getTime()

      if (expired) {
        // 避免過期仍為 active，這裡嘗試同步關閉（失敗也無妨，仍然導向）
        if (store.is_active) {
          try {
            await supabase.from('stores').update({ is_active: false }).eq('id', link.store_id)
          } catch {
            // 靜默忽略寫入失敗
          }
        }
        const to = req.nextUrl.clone()
        to.pathname = '/expired'
        // 可視需要保留原始目的地（例如 to.searchParams.set('from', pathname)）
        return NextResponse.redirect(to)
      }
    } catch (e) {
      // 任何錯誤都不要阻斷正常流程，僅記錄
      console.error('[middleware] expired-check error:', e)
      return NextResponse.next()
    }
  }

  // 預設放行
  return NextResponse.next()
}
