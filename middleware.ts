// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const token = req.cookies.get('sb-access-token')?.value
  const { pathname } = req.nextUrl

  const publicPaths = ['/login']

  if (!token && !publicPaths.includes(pathname)) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/store', '/store/(.*)', '/order', '/order/(.*)']
}
