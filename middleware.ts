// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/** 只有這個管理員能進 /admin/** */
const ADMIN_EMAIL = 'bctc4869@gmail.com'

/** Middleware 套用範圍：避免作用在 _next/、_vercel、靜態資源等 */
export const config = {
  matcher: [
    '/((?!_next/|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons/|images/|static/).*)',
  ],
}

/** 對匿名/一般使用者開放的路徑 */
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
  const res = NextResponse.next()

  // --- 0) 先嘗試讀取此網域下的 Supabase session（避免不必要的 www 轉址導致 Cookie 丟失）---
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let currentEmail = ''
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const supabase = createServerClient(
        SUPABASE_URL as string,
        SUPABASE_ANON_KEY as string,
        {
          cookies: {
            get: (name: string) => req.cookies.get(name)?.value,
            set: (name: string, value: string, options?: any) => {
              res.cookies.set({ name, value, ...options })
            },
            remove: (name: string, options?: any) => {
              res.cookies.delete({ name, ...options })
            },
          },
        }
      )
      const { data } = await supabase.auth.getUser()
      currentEmail = (data?.user?.email || '').toLowerCase()
    } catch {
      // 讀不到就當尚未登入
    }
  }

  // --- 1) 網域規整：只在 apex（olinex.app）且「不是已登入管理員在看 /admin」時才 308 轉到 www ---
  if (
    req.nextUrl.hostname === 'olinex.app' &&
    !(pathname.startsWith('/admin') && currentEmail === ADMIN_EMAIL)
  ) {
    const to = req.nextUrl.clone()
    to.hostname = 'www.olinex.app'
    return NextResponse.redirect(to, 308)
  }

  // --- 2) 放行靜態資源與 API ---
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/images/')
  ) {
    return res
  }

  // --- 3) 放行公開頁（含 /auth/**） ---
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/auth')) {
    return res
  }

  // --- 4) 保護 /admin/**：只有管理員能進 ---
  if (pathname.startsWith('/admin')) {
    // 若缺關鍵環境變數或讀不到 session / 不是管理員，一律導回 /login（使用 www 網域）
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || currentEmail !== ADMIN_EMAIL) {
      const to = req.nextUrl.clone()
      to.hostname = 'www.olinex.app'
      to.pathname = '/login'
      to.searchParams.set('from', pathname)
      return NextResponse.redirect(to)
    }
    return res
  }

  // --- 5) 其他路徑：預設放行 ---
  return res
}
