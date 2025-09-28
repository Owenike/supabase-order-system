// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: [
    '/((?!_next/|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons/|images/|static/).*)',
  ],
}

const PUBLIC_PATHS = new Set<string>([
  '/',
  '/login',
  '/admin/accept-invite',
  '/store/new',
  '/store/forgot-password',
  '/store/reset-password',
])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1) 網域統一：把裸網域轉到 www（不處理其他子網域）
  if (req.nextUrl.hostname === 'olinex.app') {
    const to = req.nextUrl.clone()
    to.hostname = 'www.olinex.app'
    return NextResponse.redirect(to, 308)
  }

  // 2) 放行靜態資源與 API
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/images/')
  ) {
    return NextResponse.next()
  }

  // 3) 放行公開頁（含 /auth/**）
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  // 4) 其他路徑：一律放行（包含 /admin/**）
  //    權限驗證交給 /pages/admin/dashboard.tsx 的表單處理
  return NextResponse.next()
}
