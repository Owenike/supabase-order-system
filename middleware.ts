// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: [
    '/((?!_next/|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons/|images/|static/).*)',
  ],
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const pathname = url.pathname

  // 允許 API、靜態資源通過
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/images/')
  ) {
    return NextResponse.next()
  }

  // 允許公開頁面通過
  if (
    pathname === '/login' ||
    pathname === '/admin/accept-invite' ||
    pathname.startsWith('/auth') ||
    pathname === '/store/new' || // ✅ 註冊頁
    pathname === '/store/forgot-password' || // ✅ 忘記密碼
    pathname === '/store/reset-password' // ✅ 重設密碼
  ) {
    return NextResponse.next()
  }

  // 自動導向 www
  if (req.nextUrl.hostname === 'olinex.app') {
    const to = req.nextUrl.clone()
    to.hostname = 'www.olinex.app'
    return NextResponse.redirect(to, 308)
  }

  // 其他情況 → 預設通過（或之後可加上 session 檢查）
  return NextResponse.next()
}
