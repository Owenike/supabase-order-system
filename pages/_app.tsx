// pages/_app.tsx
import type { AppProps } from 'next/app'
import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import StoreShell from '@/components/layouts/StoreShell'
import '@/styles/globals.css' // ★ 載入全域樣式（Tailwind 等）

// === Error Boundary（保留你的紀錄到 Supabase 的機制）===
type RBState = { hasError: boolean; msg: string }
type RBProps = { children: React.ReactNode }

class RootErrorBoundary extends React.Component<RBProps, RBState> {
  constructor(props: RBProps) {
    super(props)
    this.state = { hasError: false, msg: '' }
  }
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, msg: (error as Error)?.message || 'Unhandled error' }
  }
  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // 不 await，避免型別衝突；失敗就忽略
    try {
      void supabase.from('client_errors').insert({
        message: (error as Error)?.message || 'client error',
        stack: (error as Error)?.stack || null,
        extra: JSON.stringify(errorInfo || {}),
        url: typeof location !== 'undefined' ? location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      })
    } catch {
      /* ignore */
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 640, margin: '40px auto', padding: 16 }}>
          <h1>⚠️ 應用程式錯誤</h1>
          <p style={{ color: '#b91c1c' }}>發生例外：{this.state.msg}</p>
          <button onClick={() => location.reload()} style={{ padding: '8px 12px' }}>
            重新整理
          </button>
        </div>
      )
    }
    return this.props.children as React.ReactNode
  }
}

// 需要自動套用 StoreShell 的頁面標題（保持與 /store 首頁風格一致）
const TITLE_MAP: Record<string, string> = {
  '/store/manage-menus': '分類與菜單管理',
  '/store/orders': '訂單管理',
  '/store/stats': '銷售報表',
  '/qrcode': '產生 QRCode',
  '/store/manage-addons': '加料管理',
}

/** 公開路徑（不需要登入、不應導回 /login） */
const PUBLIC_ROUTES = new Set<string>([
  '/', // 若有首頁
  '/login',
  '/admin/accept-invite',
  '/store/new',              // ✅ 註冊頁
  '/store/forgot-password',  // ✅ 忘記密碼
  '/store/reset-password',   // ✅ 重設密碼
])

/** 以「前綴」視為公開（例如 /auth/callback） */
const PUBLIC_PREFIXES = ['/auth']

/** 需要登入的區段（未登入就導回 /login?next=） */
const PROTECTED_PREFIXES = ['/store', '/qrcode', '/admin']

/** 由 router.asPath 取出純淨 pathname（去掉查詢與 hash） */
function pathFromAsPath(asPath: string): string {
  try {
    // 給相對路徑加個假域名，方便用 URL 解析
    const u = new URL(asPath, 'https://dummy.local')
    return u.pathname
  } catch {
    // 後備：手動切
    return asPath.split('#')[0].split('?')[0]
  }
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()

  // ✅ 把前端 session 同步成 Cookie，供 API 端讀取（保留你的原邏輯）
  useEffect(() => {
    // 1) 首次載入時，如已登入，主動同步一次
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'INITIAL', session }),
        })
      } catch {
        /* ignore */
      }
    })()

    // 2) 登入/登出/token 變更時，同步 Cookie
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, session }),
        })
      } catch {
        /* ignore */
      }
    })
    // ※ 正確退訂寫法：subscription.unsubscribe()
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  // ✅ Client 端保護：只保護「受保護前綴」而且不在公開白名單內的路徑
  useEffect(() => {
    const pathname = pathFromAsPath(router.asPath)

    // 命中公開路徑 → 直接放行
    if (PUBLIC_ROUTES.has(pathname)) return
    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return

    // 不是受保護前綴 → 放行
    if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) return

    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const hasSession = Boolean(data.session)
      if (!hasSession) {
        const next = encodeURIComponent(router.asPath)
        // 只有在不在 /login 本身時才導回，避免迴圈
        if (pathname !== '/login') {
          router.replace(`/login?next=${next}`)
        }
      }
    })

    return () => {
      cancelled = true
    }
    // 以 asPath 監聽，確保 query/path 變更都會檢查
  }, [router.asPath])

  // 只對「/store」底下的子頁與 /qrcode 套殼；/store 首頁本身已有專屬視覺就不套
  const path = router.pathname
  const useShell =
    (path.startsWith('/store/') && path !== '/store' && path !== '/store/index') ||
    path === '/qrcode'
  const title = TITLE_MAP[path]

  const body = <Component {...pageProps} />

  return (
    <RootErrorBoundary>
      {useShell ? <StoreShell title={title}>{body}</StoreShell> : body}
    </RootErrorBoundary>
  )
}
