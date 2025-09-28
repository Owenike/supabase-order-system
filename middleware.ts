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
  '/',                    // 首頁（若有）
  '/login',
  '/admin/accept-invite',
  '/store/new',           // 註冊頁（公開）
  '/store/forgot-password',
  '/store/reset-password',
])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1) 網域規整：強制到 www（只針對裸網域 olinex.app）
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

  // 3) 放行公開頁（含 /auth/callback、/auth/**）
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  // 4) 保護 /admin/**：只有管理員能進
  if (pathname.startsWith('/admin')) {
    const res = NextResponse.next()

    // 缺環境變數時避免崩潰：直接導回 /login
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const to = req.nextUrl.clone()
      to.pathname = '/login'
      to.searchParams.set('from', pathname)
      return NextResponse.redirect(to)
    }

    try {
      const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
          get: (name: string) => req.cookies.get(name)?.value,
          set: (name: string, value: string, options: any) => {
            res.cookies.set({ name, value, ...options })
          },
          remove: (name: string, options: any) => {
            res.cookies.delete({ name, ...options })
          },
        },
      })

      const { data } = await supabase.auth.getUser()
      const email = (data?.user?.email || '').toLowerCase()

      if (email !== ADMIN_EMAIL) {
        const to = req.nextUrl.clone()
        to.pathname = '/login'
        to.searchParams.set('from', pathname)
        return NextResponse.redirect(to)
      }

      // 管理員合法進入
      return res
    } catch {
      // 解析失敗一律視為未登入
      const to = req.nextUrl.clone()
      to.pathname = '/login'
      to.searchParams.set('from', pathname)
      return NextResponse.redirect(to)
    }
  }

  // 5) 其他路徑：預設放行
  return NextResponse.next()
}
