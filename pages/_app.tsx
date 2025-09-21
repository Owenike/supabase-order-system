// pages/_app.tsx
'use client'

import type { AppProps } from 'next/app'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import StoreShell from '@/components/layouts/StoreShell'
import '@/styles/globals.css'

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

// 顯示在 StoreShell 標題列的對照
const TITLE_MAP: Record<string, string> = {
  '/store/manage-menus': '分類與菜單管理',
  '/store/orders': '訂單管理',
  '/store/stats': '銷售報表',
  '/qrcode': '產生 QRCode',
  '/store/manage-addons': '加料管理',
}

/** 公開路徑（不需要登入、不應導回登入頁） */
const PUBLIC_ROUTES = new Set<string>([
  '/', // 若有首頁
  '/login',               // 店家登入
  '/admin/login',         // 管理員登入
  '/admin/accept-invite',
  '/store/new',           // 店家註冊
  '/store/forgot-password',
  '/store/reset-password',
])

/** 以「前綴」視為公開（例如 /auth/callback） */
const PUBLIC_PREFIXES = ['/auth']

/** 需要登入的區段 */
const PROTECTED_PREFIXES = ['/store', '/qrcode', '/admin']

/** /store 底下不套 StoreShell 的頁（公開或有自己版型） */
const STORE_SHELL_EXCLUDE = new Set<string>([
  '/store',
  '/store/index',
  '/store/new',
  '/store/forgot-password',
  '/store/reset-password',
])

/** 從 asPath 解析出乾淨 pathname */
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

  // === 1) 先同步前端 session -> 後端 Cookie（保留你的原邏輯） ===
  const lastCallbackAtRef = useRef<number>(0)
  useEffect(() => {
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      try {
        const now = Date.now()
        if (now - lastCallbackAtRef.current > 1500) {
          lastCallbackAtRef.current = now
          await fetch('/api/auth/callback', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'INITIAL', session }),
          })
        }
      } catch {
        /* ignore */
      }
    })()

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        const now = Date.now()
        if (now - lastCallbackAtRef.current > 1500) {
          lastCallbackAtRef.current = now
          await fetch('/api/auth/callback', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, session }),
          })
        }
      } catch {
        /* ignore */
      }
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  // === 2) 取得並緩存「是否有 session」；在**拿到結果之前，不做任何導頁**（修正閃回） ===
  const [authChecked, setAuthChecked] = useState(false)
  const [hasSession, setHasSession] = useState<boolean>(false)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setHasSession(Boolean(data.session))
      setAuthChecked(true)
    }
    load()

    // 伴隨後續事件變更，也更新 hasSession
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session))
      setAuthChecked(true)
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  // === 3) 只有在「authChecked === true」之後，才對受保護路徑做導頁 ===
  useEffect(() => {
    if (!authChecked) return // 關鍵：還沒拿到 session 前，不判斷

    const pathname = pathFromAsPath(router.asPath)

    // 白名單直接放行
    if (PUBLIC_ROUTES.has(pathname)) return
    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return

    // 非受保護前綴也放行
    if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) return

    if (!hasSession) {
      const next = encodeURIComponent(router.asPath)
      if (pathname.startsWith('/admin')) {
        if (pathname !== '/admin/login') router.replace(`/admin/login?next=${next}`)
      } else {
        if (pathname !== '/login') router.replace(`/login?next=${next}`)
      }
    }
  }, [authChecked, hasSession, router.asPath])

  // === 4) 決定是否套 StoreShell（與你原本一致，並排除公開 /store 頁） ===
  const path = pathFromAsPath(router.asPath)
  const useShell =
    (path.startsWith('/store/') && !STORE_SHELL_EXCLUDE.has(path)) || path === '/qrcode'
  const title = TITLE_MAP[path]
  const body = <Component {...pageProps} />

  return (
    <RootErrorBoundary>
      {useShell ? <StoreShell title={title}>{body}</StoreShell> : body}
    </RootErrorBoundary>
  )
}
