// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: ['/((?!_next/|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons/|images/|static/).*)'],
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const pathname = url.pathname

  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.startsWith('/static/') || pathname.startsWith('/images/')) {
    return NextResponse.next()
  }

  if (pathname === '/login' || pathname === '/admin/accept-invite' || pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  if (req.nextUrl.hostname === 'olinex.app') {
    const to = req.nextUrl.clone()
    to.hostname = 'www.olinex.app'
    return NextResponse.redirect(to, 308)
  }

  return NextResponse.next()
}
