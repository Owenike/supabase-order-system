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

  // 允許 API、靜態資源
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/images/')
  ) {
    return NextResponse.next()
  }

  // 不需要登入的公開頁面
  const publicPaths = [
    '/login',
    '/admin/accept-invite',
    '/store/new', // ✅ 店家註冊頁
    '/store/forgot-password', // ✅ 忘記密碼
    '/store/reset-password', // ✅ 重設密碼
  ]
  if (publicPaths.includes(pathname) || pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  // 自動導向 www
  if (req.nextUrl.hostname === 'olinex.app') {
    const to = req.nextUrl.clone()
    to.hostname = 'www.olinex.app'
    return NextResponse.redirect(to, 308)
  }

  // 其餘頁面 → 之後可以在這裡加上登入檢查
  return NextResponse.next()
}
