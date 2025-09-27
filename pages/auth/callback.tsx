// /pages/auth/callback.tsx
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

type ViewState =
  | { status: 'idle' }
  | { status: 'exchanging' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export default function AuthCallback() {
  const router = useRouter()
  const [state, setState] = useState<ViewState>({ status: 'idle' })

  // 解析 query 參數（Supabase 驗證連結會帶 ?code=...&type=...）
  const code = useMemo(() => {
    if (!router.isReady) return null
    const v = router.query.code
    return Array.isArray(v) ? v[0] : v ?? null
  }, [router.isReady, router.query.code])

  const type = useMemo(() => {
    if (!router.isReady) return null
    const v = router.query.type
    return Array.isArray(v) ? v[0] : v ?? null
  }, [router.isReady, router.query.type])

  const errorDescription = useMemo(() => {
    if (!router.isReady) return null
    const v = router.query.error_description
    return Array.isArray(v) ? v[0] : v ?? null
  }, [router.isReady, router.query.error_description])

  useEffect(() => {
    if (!router.isReady) return

    let cancelled = false

    const run = async () => {
      // 1) 若網址帶有錯誤，直接顯示失敗
      if (errorDescription) {
        setState({ status: 'error', message: decodeURIComponent(errorDescription) })
        return
      }

      // 2) 有 code → 用 exchangeCodeForSession 正式換取 session
      if (code) {
        setState({ status: 'exchanging' })
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (cancelled) return

        if (error) {
          setState({
            status: 'error',
            message: `驗證失敗：${error.message}`,
          })
          return
        }

        // 交換成功：data.session / data.user 應有值
        setState({
          status: 'success',
          message: 'Email 驗證成功，正在導向登入頁…',
        })

        // ✅ 依你的流程導向：目前導到 /login，如要直接進後台請改成 /store
        setTimeout(() => {
          if (!cancelled) router.replace('/login')
        }, 1200)

        return
      }

      // 3) 沒有 code（少數舊版 hash 流程或不完整 URL）
      //    嘗試檢查是否已經有 session（萬一 detectSessionInUrl 被其他頁處理過）
      const { data: sessionData } = await supabase.auth.getSession()
      if (cancelled) return

      if (sessionData.session) {
        setState({
          status: 'success',
          message: '已完成登入，正在導向登入頁…',
        })
        setTimeout(() => {
          if (!cancelled) router.replace('/login')
        }, 1000)
      } else {
        setState({
          status: 'error',
          message:
            '驗證代碼遺失或連結無效。請回到註冊／登入頁重新取得驗證信。',
        })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [router, code, errorDescription])

  // --- UI ---
  const boxClass =
    state.status === 'exchanging'
      ? 'border-white/20 bg-white/5'
      : state.status === 'success'
      ? 'border-emerald-400/30 bg-emerald-500/10'
      : state.status === 'error'
      ? 'border-red-400/30 bg-red-500/10'
      : 'border-white/10 bg-white/5'

  const message =
    state.status === 'exchanging'
      ? '驗證中，請稍候…'
      : state.status === 'success'
      ? state.message
      : state.status === 'error'
      ? state.message
      : '準備中…'

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0B0B0B] text-white p-6">
      <div className={`w-full max-w-md rounded-xl border px-5 py-4 ${boxClass}`}>
        <h1 className="text-xl font-semibold mb-2">完成 Email 驗證</h1>
        <p className="opacity-90">{message}</p>
        <p className="mt-3 text-xs opacity-60">
          {type ? `type=${type}` : 'type 未提供'}
          {code ? '（收到 code）' : '（未收到 code）'}
        </p>
      </div>
    </main>
  )
}
