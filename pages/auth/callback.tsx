// /pages/auth/callback.tsx
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

type ViewState =
  | { status: 'idle' }
  | { status: 'exchanging' }   // 用 ?code= 換 session
  | { status: 'waiting' }      // 等 SDK 解析 #access_token
  | { status: 'inserting' }    // 建立/同步 stores
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export default function AuthCallbackPage() {
  const router = useRouter()
  const [state, setState] = useState<ViewState>({ status: 'idle' })

  // 可能帶 ?code=...&type=...；部分客戶端用 #access_token 回傳
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

  /**
   * 以 user_id 為唯一鍵補齊 stores
   * 前提：DB 已有 UNIQUE(user_id) ；RLS 允許本人 insert/select
   */
  const bootstrapStoreByUserId = async (isCancelled: () => boolean) => {
    // 取目前使用者
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (isCancelled()) return
    if (userErr || !userRes?.user) throw new Error(userErr?.message || '取得使用者失敗')

    const user = userRes.user
    const meta = (user.user_metadata ?? {}) as {
      store_name?: string
      owner_name?: string
      phone?: string
    }

    // 先看是否已存在（只用 user_id）
    const { data: exists, error: findErr } = await supabase
      .from('stores')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (isCancelled()) return
    if (findErr) throw new Error(`查詢門市失敗：${findErr.message}`)

    // 沒有就建立（onConflict 對應 UNIQUE(user_id)）
    if (!exists) {
      const payload = {
        user_id: user.id,
        name: meta.store_name ?? '未命名店家',
        owner_name: meta.owner_name ?? null,
        phone: meta.phone ?? null,
        email: user.email ?? null,
      }

      const { error: insErr } = await supabase
        .from('stores')
        .upsert([payload], { onConflict: 'user_id', ignoreDuplicates: false })

      if (isCancelled()) return
      if (insErr) throw new Error(`建立門市失敗：${insErr.message}`)
    }
  }

  useEffect(() => {
    if (!router.isReady) return
    let cancelled = false
    const isCancelled = () => cancelled

    const run = async () => {
      // URL 帶錯誤時直接顯示
      if (errorDescription) {
        setState({ status: 'error', message: decodeURIComponent(errorDescription) })
        return
      }

      // 1) 有 ?code= → 換 session
      if (code) {
        setState({ status: 'exchanging' })
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (isCancelled()) return
        if (exErr) {
          setState({ status: 'error', message: `驗證失敗：${exErr.message}` })
          return
        }

        // 換成功 → 建立/同步 stores
        try {
          setState({ status: 'inserting' })
          await bootstrapStoreByUserId(isCancelled)
        } catch (e: any) {
          setState({ status: 'error', message: e?.message || '補齊資料時發生未知錯誤' })
          return
        }

        setState({ status: 'success', message: '驗證成功，資料已建立/同步，正在導向登入頁…' })
        setTimeout(() => { if (!isCancelled()) router.replace('/login') }, 1000)
        return
      }

      // 2) 沒有 ?code= → 等 SDK 解析 #access_token（detectSessionInUrl:true）
      setState({ status: 'waiting' })
      const deadline = Date.now() + 3000
      while (!isCancelled() && Date.now() < deadline) {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          try {
            setState({ status: 'inserting' })
            await bootstrapStoreByUserId(isCancelled)
          } catch (e: any) {
            setState({ status: 'error', message: e?.message || '補齊資料時發生未知錯誤' })
            return
          }

          setState({ status: 'success', message: '登入完成，資料已同步，正在導向登入頁…' })
          setTimeout(() => { if (!isCancelled()) router.replace('/login') }, 800)
          return
        }
        await new Promise((r) => setTimeout(r, 150))
      }

      // 3) 仍無 session → 視為連結無效或被預抓破壞
      setState({
        status: 'error',
        message: '驗證代碼遺失或連結無效，請回到註冊/登入頁重新取得驗證信。',
      })
    }

    void run()
    return () => { cancelled = true }
  }, [router.isReady, code, errorDescription, router])

  // --- UI ---
  const boxClass =
    state.status === 'exchanging' || state.status === 'waiting' || state.status === 'inserting'
      ? 'border-white/20 bg-white/5'
      : state.status === 'success'
      ? 'border-emerald-400/30 bg-emerald-500/10'
      : state.status === 'error'
      ? 'border-red-400/30 bg-red-500/10'
      : 'border-white/10 bg-white/5'

  const message =
    state.status === 'exchanging'
      ? '驗證中，請稍候…'
      : state.status === 'waiting'
      ? '處理驗證連結中…'
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
