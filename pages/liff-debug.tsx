// /pages/liff-debug.tsx
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const LIFF_ID = '2007831464-7LDjNnmD' // 請確認與後台一致

function LiffDebugPage() {
  const [inClient, setInClient] = useState<boolean | null>(null)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>('')

  const [hasCode, setHasCode] = useState(false)
  const [hasState, setHasState] = useState(false)
  const [idToken, setIdToken] = useState<string>('')
  const [profile, setProfile] = useState<{ userId?: string; displayName?: string } | null>(null)

  // 這兩個原本直接在 JSX 用到 window/navigator，改成 state 承接，避免 SSR 報錯
  const [ua, setUa] = useState('')
  const [loc, setLoc] = useState('')

  useEffect(() => {
    setUa(typeof navigator !== 'undefined' ? navigator.userAgent : '')
    setLoc(typeof window !== 'undefined' ? window.location.href : '')

    ;(async () => {
      try {
        const { default: liff } = await import('@line/liff')
        setInClient(liff.isInClient())

        // 外部瀏覽器 → 走 external；LINE 內 → 走同容器
        await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: !liff.isInClient() })
        await liff.ready
        setLoggedIn(liff.isLoggedIn())

        const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
        setHasCode(!!qs.get('code'))
        setHasState(!!qs.get('state'))

        if (liff.isLoggedIn()) {
          setIdToken(liff.getIDToken() || '')
          try {
            const p = await liff.getProfile()
            setProfile({ userId: p.userId, displayName: p.displayName })
          } catch {}
        }
        setReady(true)
      } catch (e: any) {
        console.error('LIFF init error:', e)
        setError(String(e?.message || e))
        setReady(true)
      }
    })()
  }, [])

  const handleLogin = async () => {
    const { default: liff } = await import('@line/liff')
    liff.login({ redirectUri: typeof window !== 'undefined' ? window.location.href : '' })
  }

  const handleLogout = async () => {
    const { default: liff } = await import('@line/liff')
    try { liff.logout() } catch {}
    if (typeof window !== 'undefined') window.location.href = '/liff-debug'
  }

  return (
    <div style={{ maxWidth: 680, margin: '24px auto', fontFamily: 'sans-serif' }}>
      <h1>LIFF Debug</h1>
      <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <p><b>LIFF ID:</b> {LIFF_ID}</p>
        <p><b>UserAgent:</b> {ua}</p>
        <p><b>Location:</b> {loc}</p>
        <hr/>
        <p><b>liff.isInClient():</b> {String(inClient)}</p>
        <p><b>liff.isLoggedIn():</b> {String(loggedIn)}</p>
        <p><b>has code/state in URL:</b> {String(hasCode)}/{String(hasState)}</p>
        {error && <p style={{ color: 'red' }}><b>init error:</b> {error}</p>}
        {profile && (
          <p><b>Profile:</b> {profile.displayName} ({profile.userId})</p>
        )}
        {idToken && <p><b>ID Token:</b> {idToken.slice(0,20)}…</p>}
        <div style={{ marginTop: 12 }}>
          {!loggedIn && <button onClick={handleLogin} style={{ padding: '8px 12px', background: '#06c755', color: '#fff', border: 0, borderRadius: 6 }}>使用 LINE 登入</button>}
          {loggedIn && <button onClick={handleLogout} style={{ padding: '8px 12px' }}>登出</button>}
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 14, color: '#555' }}>
        <b>若看到 init error：</b>
        <ol>
          <li>檢查「Messaging API channel → LIFF → 該 App」的 <b>LIFF ID</b> 與此頁一致</li>
          <li>檢查 <b>Endpoint URL</b>：必須精確為 <code>https://www.olinex.app/order</code>（含 www、含 /order）</li>
          <li>Channel 是否 <b>Published</b> 或你在 <b>Admin/Developer/Testers 名單</b></li>
        </ol>
      </div>
    </div>
  )
}

// 關鍵：這行讓此頁「只在 Client render」，避免 Vercel 預渲染時碰到 window
export default dynamic(() => Promise.resolve(LiffDebugPage), { ssr: false })
