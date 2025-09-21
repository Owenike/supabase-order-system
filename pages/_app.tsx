// pages/_app.tsx
import type { AppProps } from 'next/app'
import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import StoreShell from '@/components/layouts/StoreShell'
import '@/styles/globals.css'

// === Error Boundary ===
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
    try {
      void supabase.from('client_errors').insert({
        message: (error as Error)?.message || 'client error',
        stack: (error as Error)?.stack || null,
        extra: JSON.stringify(errorInfo || {}),
        url: typeof location !== 'undefined' ? location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      })
    } catch {}
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

// 顯示在 StoreShell 標題列的對照
const TITLE_MAP: Record<string, string> = {
  '/store/manage-menus': '分類與菜單管理',
  '/store/orders': '訂單管理',
  '/store/stats': '銷售報表',
  '/qrcode': '產生 QRCode',
  '/store/manage-addons': '加料管理',
}

/** 公開路徑（不需要登入、不應導回 /login） */
const PUBLIC_ROUTES = new Set<string>([
  '/',
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

/** 不要套用 StoreShell 的公開路徑（避免殼內的守門機制干擾） */
const STORE_SHELL_EXCLUDE = new Set<string>([
  '/store',                 // 首頁已有自己外觀
  '/store/index',
  '/store/new',             // ✅ 公開
  '/store/forgot-password', // ✅ 公開
  '/store/reset-password',  // ✅ 公開
])

function pathFromAsPath(asPath: string): string {
  try {
    const u = new URL(asPath, 'https://dummy.local')
    return u.pathname
  } catch {
    return asPath.split('#')[0].split('?')[0]
  }
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()

  // 同步 session -> Cookie（保留你的原邏輯）
  useEffect(() => {
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
      } catch {}
    })()

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, session }),
        })
      } catch {}
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  // Client 端保護（白名單放行）
  useEffect(() => {
    const pathname = pathFromAsPath(router.asPath)
    if (PUBLIC_ROUTES.has(pathname)) return
    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return
    if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) return

    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const hasSession = Boolean(data.session)
      if (!hasSession && pathname !== '/login') {
        const next = encodeURIComponent(router.asPath)
        router.replace(`/login?next=${next}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [router.asPath])

  // 只對需要的路徑套 StoreShell；**排除公開的 /store 頁**
  const path = pathFromAsPath(router.asPath)
  const useShell =
    (path.startsWith('/store/') && !STORE_SHELL_EXCLUDE.has(path)) ||
    path === '/qrcode'
  const title = TITLE_MAP[path]
  const body = <Component {...pageProps} />

  return (
    <RootErrorBoundary>
      {useShell ? <StoreShell title={title}>{body}</StoreShell> : body}
    </RootErrorBoundary>
  )
}
