// pages/_app.tsx
import type { AppProps } from 'next/app'
import React, { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import '@/styles/globals.css'               // ★ 載入全域樣式（Tailwind 等）

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: any) { super(props); this.state = { hasError: false, msg: '' } }
  static getDerivedStateFromError(error: any) { return { hasError: true, msg: error?.message || 'Unhandled error' } }
  async componentDidCatch(error: any, errorInfo: any) {
    try {
      await supabase.from('client_errors').insert({
        message: error?.message || 'client error',
        stack: error?.stack || null,
        extra: JSON.stringify(errorInfo || {}),
        url: typeof location !== 'undefined' ? location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      })
    } catch {}
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 640, margin: '40px auto', padding: 16 }}>
          <h1>⚠️ 應用程式錯誤</h1>
          <p style={{ color: '#b91c1c' }}>發生例外：{this.state.msg}</p>
          <button onClick={() => location.reload()} style={{ padding: '8px 12px' }}>重新整理</button>
        </div>
      )
    }
    return this.props.children as any
  }
}

export default function MyApp({ Component, pageProps }: AppProps) {
  // ✅ 關鍵：把前端 session 同步成 Cookie，供 API 端讀取
  useEffect(() => {
    // 1) 首次載入時，若已經登入，主動同步一次
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/auth/callback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'INITIAL', session }),
      })
    })()

    // 2) 登入/登出/token 變更時，同步 Cookie
    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      await fetch('/api/auth/callback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, session }),
      })
    })
    return () => { subscription.subscription.unsubscribe() }
  }, [])

  return (
    <RootErrorBoundary>
      <Component {...pageProps} />
    </RootErrorBoundary>
  )
}
