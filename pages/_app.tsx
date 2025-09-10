// /pages/_app.tsx
import type { AppProps } from 'next/app'
import React from 'react'
import { supabase } from '@/lib/supabaseClient'
import '@/styles/globals.css'               // ★ 加這行！載入 Tailwind

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
  return (
    <RootErrorBoundary>
      <Component {...pageProps} />
    </RootErrorBoundary>
  )
}
