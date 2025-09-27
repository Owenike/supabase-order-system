// /pages/auth/callback.tsx
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

type ViewState =
  | { status: 'idle' }
  | { status: 'exchanging' }  // 用 ?code= 換 session
  | { status: 'waiting' }     // 等 SDK 解析 #access_token
  | { status: 'inserting' }   // 正在補齊 stores
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export default function AuthCallbackPage() {
  const router = useRouter()
  const [state, setState] = useState<ViewState>({ status: 'idle' })

  // Supabase 可能帶 ?code=...&type=...；部分客戶端改用 #access_token 回傳
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

  // ---- 將補齊 stores 的邏輯抽成函式（兩條路徑都會用到） ----
  const bootstrapStore = async (cancelledRef: () => boolean) => {
    // 取最新使用者
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (cancelledRef()) return
    if (userErr || !userRes?.user) {
      throw new Error(userErr?.message || '取得使用者失敗')
    }

    const user = userRes.user
    const meta = (user.user_metadata ?? {}) as {
      store_name?: string
      owner_name?: string
      phone?: string
    }

    // 檢查是否已有 store（以 user_id 或 email 當唯一）
    const { data: exists, error: findErr } = await supabase
      .from('stores')
      .select('id')
      .or(`user_id.eq.${user.id},email.eq.${user.email ?? ''}`)
      .maybeSingle()

    if (cancelledRef()) return
    if (findErr) throw new Error(`查詢門市失敗：${findErr.message}`)

    if (!exists) {
      const payload = {
        name: meta.store_name ?? '未命名店家',
        owner_name: meta.owner_name ?? null,
        phone: meta.phone ?? null,
        email: user.email ?? null,
        user_id: user.id,
      }

      const { error: insErr } = await supabase
        .from('stores')
        .upsert([payload], { onConflict: 'user_id', ignoreDuplicates: false })

      if (cancelledRef()) return
      if (insErr) throw new Error(`建立門市失敗：${insErr.message}`)
    }
  }

  useEffect(() => {
    if (!router.isReady) return
    let cancelled = false
    const isCancelled = () => cancelled

    const run = async () => {
      // 帶錯誤參數時，直接顯示
      if (errorDescription) {
        setState({ status: 'error', message: decodeURIComponent(errorDescription) })
        return
      }

      // 1) 有 ?code= → 用 code 交換 session
      if (code) {
        setState({ status: 'exchanging' })
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (isCancelled()) return
        if (exErr) {
          setState({ status: 'error', message: `驗證失敗：${exErr.message}` })
          return
        }

        // 交換成功 → 補齊 stores
        try {
          setState({ status: 'inserting' })
          await bootstrapStore(isCancelled)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : '補齊資料時發生未知錯誤'
          setState({ status: 'error', message: msg })
          return
        }

        setState({ status: 'success', message: '驗證成功，資料已建立/同步，正在導向登入頁…' })
        setTimeout(() => { if (!isCancelled()) router.replace('/login') }, 1200)
        return
      }

      // 2) 沒有 ?code= → 多數行動郵件用 #access_token 回跳
      //    由於 /lib/supabaseClient.ts 設了 detectSessionInUrl:true，
      //    SDK 會自動解析 hash 並建立 session；這裡等他一下。
      setState({ status: 'waiting' })
      const deadline = Date.now() + 3000
      while (!isCancelled() && Date.now() < deadline) {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          // 已有 session → 補齊 stores
          try {
            setState({ status: 'inserting' })
            await bootstrapStore(isCancelled)
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '補齊資料時發生未知錯誤'
            setState({ status: 'error', message: msg })
            return
          }

          setState({ status: 'success', message: '登入完成，資料已同步，正在導向登入頁…' })
          setTimeout(() => { if (!isCancelled()) router.replace('/login') }, 800)
          return
        }
        await new Promise((r) => setTimeout(r, 150))
      }

      // 3) 還是沒有 session → 視為連結失效或被預抓破壞
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
