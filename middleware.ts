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

  // ✅ 略過 OAuth 關鍵頁，避免回傳夾 code/state 的瞬間又被 308
  if (pathname.startsWith('/order') || pathname.startsWith('/line-success')) {
    return NextResponse.next()
  }

  if (url.hostname === 'olinex.app') {
    url.hostname = 'www.olinex.app'
    return NextResponse.redirect(url, 308)
  }
  return NextResponse.next()
}
