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

  // ✅ 略過 OAuth/授權回跳頁、過期提示頁與「登入頁」
  //    （特別是 /login，避免你前端 replace('/login') 卻被中介層又導回 /admin/login）
  if (
    pathname.startsWith('/order') ||
    pathname.startsWith('/line-success') ||
    pathname.startsWith('/expired') ||
    pathname === '/login' ||
    pathname.startsWith('/api/') // 建議 API 也不攔，避免多餘查詢
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
  // 設計：僅在「店家後台」路徑才檢查是否到期（/store/*）
  // 理由：/admin/* 由管理員使用，需可維運到期店家，因此不擋。
  if (pathname.startsWith('/store')) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // 從 cookie 取得 Supabase 的 access token（@supabase/auth-js 預設名）
      const accessToken = req.cookies.get('sb-access-token')?.value
      if (!accessToken) {
        // 未登入就先放行（頁面本身可再做 auth 保護）
        return NextResponse.next()
      }

      // 以 access token 取得當前使用者
      const { data: userRes, error: userErr } = await supabase.auth.getUser(accessToken)
      if (userErr || !userRes?.user) return NextResponse.next()

      const user = userRes.user

      // 由使用者 Email 找所屬店家（如一人多店，可之後擴充 store_id 指定）
      const { data: link } = await supabase
        .from('store_user_links')
        .select('store_id')
        .eq('email', user.email)
        .maybeSingle()

      if (!link?.store_id) return NextResponse.next()

      // 讀取店家試用期限與啟用狀態
      const { data: store } = await supabase
        .from('stores')
        .select('trial_end_at, is_active')
        .eq('id', link.store_id)
        .maybeSingle()

      if (!store?.trial_end_at) return NextResponse.next()

      const expired = Date.now() > new Date(store.trial_end_at).getTime()

      if (expired) {
        // 若過期仍為 active，嘗試同步關閉（失敗也不影響導向）
        if (store.is_active) {
          try {
            await supabase.from('stores').update({ is_active: false }).eq('id', link.store_id)
          } catch {}
        }
        const to = req.nextUrl.clone()
        to.pathname = '/expired'
        return NextResponse.redirect(to)
      }
    } catch (e) {
      console.error('[middleware] expired-check error:', e)
      return NextResponse.next()
    }
  }

  // 預設放行
  return NextResponse.next()
}
