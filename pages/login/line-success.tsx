// /pages/line-success.tsx
/* eslint-disable no-console */
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

const REDIRECT_URI_BASE = 'https://www.olinex.app/order'
const COOKIE_QS_KEY = 'order_qs_backup'
const SAVED_QS_KEY = 'order_return_qs'
const SAVED_STORE_KEY = 'order_store'
const SAVED_TABLE_KEY = 'order_table'
const COOKIE_DOMAIN = '.olinex.app'

const FALLBACK_STORE_ID = process.env.NEXT_PUBLIC_FALLBACK_STORE_ID || '11b687d8-f529-4da0-b901-74d5e783e6f2'
const FALLBACK_TABLE = process.env.NEXT_PUBLIC_FALLBACK_TABLE || '外帶'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
function setCookie(name: string, value: string, maxAgeSec = 600) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; Domain=${COOKIE_DOMAIN}; SameSite=Lax; Secure`
}
function delCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${COOKIE_DOMAIN}; SameSite=Lax; Secure`
}
function safeWindow(): Window | null {
  return typeof window !== 'undefined' ? window : null
}
function parseQS(qs: string): Record<string, string> {
  const out: Record<string, string> = {}
  const p = new URLSearchParams(qs.startsWith('?') ? qs : `?${qs}`)
  p.forEach((v, k) => (out[k] = v))
  return out
}
function resolveTargetFromEverywhere(w: Window, q: Record<string, any>) {
  let store: string | undefined
  let table: string | undefined
  if (typeof q.store === 'string' && q.store) store = q.store
  if (typeof q.table === 'string' && q.table) table = q.table
  if ((!store || !table) && w.location.search) {
    const p = new URLSearchParams(w.location.search)
    if (!store && p.get('store')) store = p.get('store') || undefined
    if (!table && p.get('table')) table = p.get('table') || undefined
  }
  const cookieQs = getCookie(COOKIE_QS_KEY)
  if ((!store || !table) && cookieQs) {
    const p = new URLSearchParams(cookieQs.startsWith('?') ? cookieQs : `?${cookieQs}`)
    if (!store && p.get('store')) store = p.get('store') || undefined
    if (!table && p.get('table')) table = p.get('table') || undefined
  }
  if ((!store || !table) && typeof q.liffRedirectUri === 'string' && q.liffRedirectUri) {
    try {
      const decoded = decodeURIComponent(q.liffRedirectUri)
      const u = new URL(decoded)
      const s = u.searchParams.get('store') || undefined
      const t = u.searchParams.get('table') || undefined
      if (!store && s) store = s
      if (!table && t) table = t
    } catch {}
  }
  const savedQs = w.sessionStorage.getItem(SAVED_QS_KEY) || ''
  if ((!store || !table) && savedQs) {
    const parsed = parseQS(savedQs)
    if (!store && parsed.store) store = parsed.store
    if (!table && parsed.table) table = parsed.table
  }
  if (!store) {
    const s = w.localStorage.getItem(SAVED_STORE_KEY) || ''
    if (s) store = s
  }
  if (!table) {
    const t = w.localStorage.getItem(SAVED_TABLE_KEY) || ''
    if (t) table = t
  }
  if (!store) store = FALLBACK_STORE_ID
  if (!table) table = FALLBACK_TABLE
  return { store, table }
}
function buildOrderUrl(store?: string, table?: string) {
  const sp = new URLSearchParams()
  if (store) sp.set('store', store)
  if (table) sp.set('table', table)
  return sp.toString() ? `${REDIRECT_URI_BASE}?${sp.toString()}` : REDIRECT_URI_BASE
}

function LineSuccessPage() {
  const router = useRouter()
  const w = safeWindow()
  const { code, state } = router.query
  const hasAuthParams = useMemo(() => typeof code === 'string' && typeof state === 'string', [code, state])
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!w) return
    let cancelled = false
    ;(async () => {
      try {
        if (!hasAuthParams) return
        // 嘗試從 LIFF 寫入 line_user_id（若在 LIFF 內已登入）
        try {
          const { getLiff } = await import('@/lib/liffClient')
          const liff = await getLiff()
          if (liff.isLoggedIn()) {
            const decoded: any = liff.getDecodedIDToken?.()
            const sub: string | undefined = decoded?.sub
            if (sub) setCookie('line_user_id', sub, 7 * 24 * 3600)
            try {
              const profile = await liff.getProfile()
              if (profile?.userId) setCookie('line_user_id', profile.userId, 7 * 24 * 3600)
            } catch {}
          }
        } catch {}

        const { store, table } = resolveTargetFromEverywhere(w, router.query)
        const cleanOrderUrl = buildOrderUrl(store, table)
        delCookie(COOKIE_QS_KEY)

        if (!cancelled) {
          setDone(true)
          router.replace(cleanOrderUrl)
        }
      } catch (e) {
        console.error('[line-success] error:', e)
        setDone(true)
      }
    })()
    return () => { cancelled = true }
  }, [hasAuthParams, router, w])

  if (!hasAuthParams) {
    const { store, table } = w ? resolveTargetFromEverywhere(w, router.query) : { store: '', table: '' }
    const orderUrl = buildOrderUrl(store, table)
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '40px auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>已回到站內</h1>
        <p style={{ color: '#555', marginBottom: 16 }}>目前沒有偵測到 LINE 回傳參數（code/state）。</p>
        <a href={orderUrl} style={{ display: 'inline-block', padding: '8px 12px', background: '#2563eb', color: '#fff', borderRadius: 8 }}>
          返回點餐頁
        </a>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: '40px auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>正在完成登入</h1>
      <p style={{ color: '#555' }}>請稍候，我們正在清理授權參數並返回點餐頁…</p>
      {done && <p style={{ color: '#999', marginTop: 12, fontSize: 12 }}>若停留過久，請手動返回。</p>}
    </div>
  )
}

// 關閉 SSR，避免回跳時 server 渲染干擾
export default dynamic(() => Promise.resolve(LineSuccessPage), { ssr: false })
