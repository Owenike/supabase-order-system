// /pages/auth/callback.tsx
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

type ViewState =
  | { status: 'idle' }
  | { status: 'exchanging' }
  | { status: 'inserting' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export default function AuthCallbackPage() {
  const router = useRouter()
  const [state, setState] = useState<ViewState>({ status: 'idle' })

  // Supabase 會帶 ?code=...&type=...
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
      // 1) 連結若帶錯誤，直接顯示
      if (errorDescription) {
        setState({ status: 'error', message: decodeURIComponent(errorDescription) })
        return
      }

      // 2) 有 code → 換 session
      if (code) {
        setState({ status: 'exchanging' })
        const { data: exData, error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (exErr) {
          setState({ status: 'error', message: `驗證失敗：${exErr.message}` })
          return
        }

        // 3) 寫入/補齊 stores（只在不存在時建立）
        setState({ status: 'inserting' })
        const user = exData.user
        // 從 signUp 時塞的 user_metadata 把資料取回
        const meta = (user?.user_metadata ?? {}) as {
          store_name?: string
          owner_name?: string
          phone?: string
        }

        // 先檢查是否已有 store（用 user_id 或 email 當唯一）
        const { data: exists, error: findErr } = await supabase
          .from('stores')
          .select('id')
          .or(`user_id.eq.${user?.id},email.eq.${user?.email}`)
          .maybeSingle()

        if (cancelled) return
        if (findErr) {
          setState({ status: 'error', message: `查詢門市失敗：${findErr.message}` })
          return
        }

        if (!exists) {
          // 如果你的表欄位不是這些名稱，請把 name/owner_name/phone/email/user_id 對應修改
          const payload = {
            name: meta.store_name ?? '未命名店家',
            owner_name: meta.owner_name ?? null,
            phone: meta.phone ?? null,
            email: user?.email ?? null,
            user_id: user?.id ?? null,
          }

          const { error: insErr } = await supabase
            .from('stores')
            .upsert([payload], { onConflict: 'user_id', ignoreDuplicates: false })

          if (cancelled) return
          if (insErr) {
            setState({ status: 'error', message: `建立門市失敗：${insErr.message}` })
            return
          }
        }

        // 4) 完成 → 導頁
        setState({ status: 'success', message: '驗證成功，資料已建立/同步，正在導向登入頁…' })
        setTimeout(() => {
          if (!cancelled) router.replace('/login') // 若想直接進後台可改 '/store'
        }, 1200)
        return
      }

      // 5) 沒 code（少見情境）：試著判斷是否已登入過
      const { data: sess } = await supabase.auth.getSession()
      if (cancelled) return
      if (sess.session) {
        setState({ status: 'success', message: '已完成登入，正在導向登入頁…' })
        setTimeout(() => {
          if (!cancelled) router.replace('/login')
        }, 1000)
      } else {
        setState({
          status: 'error',
          message: '驗證代碼遺失或連結無效，請回到註冊/登入頁重新取得驗證信。',
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
    state.status === 'exchanging' || state.status === 'inserting'
      ? 'border-white/20 bg-white/5'
      : state.status === 'success'
      ? 'border-emerald-400/30 bg-emerald-500/10'
      : state.status === 'error'
      ? 'border-red-400/30 bg-red-500/10'
      : 'border-white/10 bg-white/5'

  const message =
    state.status === 'exchanging'
      ? '驗證中，請稍候…'
      : state.status === 'inserting'
      ? '同步門市資料中…'
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
          {type ? `type=${type}` : 'type 未提供'}　{code ? '(收到 code)' : '(未收到 code)'}
        </p>
      </div>
    </main>
  )
}
