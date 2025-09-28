// /middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * 只有這個管理員能進 /admin/**
 */
const ADMIN_EMAIL = 'bctc4869@gmail.com'

/**
 * Middleware 套用範圍：
 * - 避免作用在 _next/、_vercel、靜態資源等
 */
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

  // --- 1) 網域規整：強制到 www ---
  if (req.nextUrl.hostname === 'olinex.app') {
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
    return NextResponse.next()
  }

  // --- 3) 放行公開頁（含 auth callback / magic link） ---
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/auth') // /auth/callback 等
  ) {
    return NextResponse.next()
  }

  // --- 4) 保護 /admin/**：只有管理員能進 ---
  if (pathname.startsWith('/admin')) {
    // 建立可讓 Supabase 寫入/讀取 Cookie 的 Response
    const res = NextResponse.next()

    // 用 createServerClient（而非 createMiddlewareClient）
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        cookies: {
          get: (name: string) => req.cookies.get(name)?.value,
          set: (name: string, value: string, options: any) => {
            // 將 Supabase 要寫的 Cookie 回寫到 Response
            res.cookies.set({ name, value, ...options })
          },
          remove: (name: string, options: any) => {
            res.cookies.delete({ name, ...options })
          },
        },
      }
    )

    // 從 Cookie 解析目前登入者
    const { data, error } = await supabase.auth.getUser()
    const email = (data?.user?.email || '').toLowerCase()

    if (error || email !== ADMIN_EMAIL) {
      // 非管理員 → 導回 /login，並帶 from 參數
      const to = req.nextUrl.clone()
      to.pathname = '/login'
      to.searchParams.set('from', pathname)
      return NextResponse.redirect(to)
    }

    // 管理員合法進入
    return res
  }

  // --- 5) 其他路徑：預設放行 ---
  return NextResponse.next()
}
