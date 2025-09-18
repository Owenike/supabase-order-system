// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const config = {
  matcher: [
    '/((?!_next/|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons/|images/|static/).*)',
  ],
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl
  const pathname = url.pathname

  // ✅ 略過 OAuth 關鍵頁
  if (pathname.startsWith('/order') || pathname.startsWith('/line-success')) {
    return NextResponse.next()
  }

  // ✅ 強制跳轉 www
  if (url.hostname === 'olinex.app') {
    url.hostname = 'www.olinex.app'
    return NextResponse.redirect(url, 308)
  }

  // ✅ 只在店家後台相關頁檢查是否過期
  if (pathname.startsWith('/store') || pathname.startsWith('/admin')) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // 從 cookie 抓取 session
      const accessToken = req.cookies.get('sb-access-token')?.value
      if (!accessToken) return NextResponse.next()

      const { data: { user } } = await supabase.auth.getUser(accessToken)
      if (!user) return NextResponse.next()

      // 找出 user 對應的 store
      const { data: link } = await supabase
        .from('store_user_links')
        .select('store_id')
        .eq('email', user.email)
        .maybeSingle()

      if (!link?.store_id) return NextResponse.next()

      // 查 store 是否已過期
      const { data: store } = await supabase
        .from('stores')
        .select('trial_end_at, is_active')
        .eq('id', link.store_id)
        .maybeSingle()

      if (store?.trial_end_at) {
        const end = new Date(store.trial_end_at).getTime()
        if (Date.now() > end) {
          // 若過期而且還是 active，就更新為停用
          if (store.is_active) {
            await supabase
              .from('stores')
              .update({ is_active: false })
              .eq('id', link.store_id)
          }
          // 導向一個提示頁（例如 /expired）
          const expiredUrl = req.nextUrl.clone()
          expiredUrl.pathname = '/expired'
          return NextResponse.redirect(expiredUrl)
        }
      }
    } catch (e) {
      console.error('[middleware] check expired error', e)
      return NextResponse.next()
    }
  }

  return NextResponse.next()
}
