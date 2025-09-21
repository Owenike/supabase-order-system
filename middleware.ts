// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: [
    '/((?!_next/|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons/|images/|static/).*)',
  ],
}

const PUBLIC_PATHS = new Set<string>([
  '/',                    // 首頁（若有）
  '/login',
  '/admin/accept-invite',
  '/store/new',           // ✅ 註冊頁（公開）
  '/store/forgot-password',
  '/store/reset-password',
])

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const { pathname } = url

  // 自動導向 www（先處理網域一致性）
  if (req.nextUrl.hostname === 'olinex.app') {
    const to = req.nextUrl.clone()
    to.hostname = 'www.olinex.app'
    return NextResponse.redirect(to, 308)
  }

  // 放行靜態資源 / API
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/images/')
  ) {
    return NextResponse.next()
  }

  // 放行公開頁（含 /store/new）
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/auth') // 你的 auth callback 等
  ) {
    return NextResponse.next()
  }

  // 其他頁面：這裡先全部放行（若要伺服器端檢查 session，再補）
  return NextResponse.next()
}
