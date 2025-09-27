// /pages/auth/callback.tsx
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

/**
 * 前提（請確認 DB 已備好）：
 * - stores(user_id uuid unique, email text unique, name text, owner_name text, phone text)
 * - store_accounts(store_id uuid unique, email text, store_name text, is_active bool, trial_* timestamps)
 * - RLS 若啟用，需允許：本人 insert/select；且允許「user_id IS NULL 的列」被本人 update 以完成認領（見文末）
 */

type ViewState =
  | { status: 'idle' }
  | { status: 'exchanging' }
  | { status: 'waiting' }
  | { status: 'inserting' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export default function AuthCallbackPage() {
  const router = useRouter()
  const [state, setState] = useState<ViewState>({ status: 'idle' })

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

  // —— 補齊：先以 user_id 找；沒有再以 email 認領；最後新增；再 upsert store_accounts ——
  const bootstrapStoreAndAccount = async (isCancelled: () => boolean) => {
    // 取使用者
    const { data: ures, error: uerr } = await supabase.auth.getUser()
    if (isCancelled()) return
    if (uerr || !ures?.user) throw new Error(uerr?.message || '取得使用者失敗')

    const user = ures.user
    const email = (user.email ?? '').toLowerCase().trim()
    const meta = (user.user_metadata ?? {}) as {
      store_name?: string
      owner_name?: string
      phone?: string
    }

    // 1) 先看 user_id 是否已有 stores
    const { data: byUid, error: findByUidErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (isCancelled()) return
    if (findByUidErr) throw new Error(`查詢門市(user_id)失敗：${findByUidErr.message}`)

    let storeId: string | null = byUid?.id ?? null
    let storeName: string | null = byUid?.name ?? null

    if (!storeId) {
      // 2) 沒有的話，用 email 尋找可能的舊資料（尚未綁 user_id 的列）
      const { data: byEmail, error: findByEmailErr } = await supabase
        .from('stores')
        .select('id, name, user_id')
        .eq('email', email)
        .maybeSingle()
      if (isCancelled()) return
      if (findByEmailErr) throw new Error(`查詢門市(email)失敗：${findByEmailErr.message}`)

      if (byEmail?.id) {
        // 2-1) 找到同 email 既有列 → 直接認領（update user_id 與基本資訊）
        const { error: claimErr } = await supabase
          .from('stores')
          .update({
            user_id: user.id,
            name: byEmail.name ?? meta.store_name ?? '未命名店家',
            owner_name: meta.owner_name ?? null,
            phone: meta.phone ?? null,
          })
          .eq('id', byEmail.id)
        if (isCancelled()) return
        if (claimErr) throw new Error(`認領既有門市失敗：${claimErr.message}`)

        storeId = byEmail.id
        storeName = byEmail.name ?? meta.store_name ?? '未命名店家'
      } else {
        // 3) 真的都沒有 → 新增（onConflict 對 user_id）
        const payload = {
          user_id: user.id,
          name: meta.store_name ?? '未命名店家',
          owner_name: meta.owner_name ?? null,
          phone: meta.phone ?? null,
          email,
        }
        const { data: ins, error: insErr } = await supabase
          .from('stores')
          .upsert([payload], { onConflict: 'user_id', ignoreDuplicates: false })
          .select('id, name')
          .maybeSingle()
        if (isCancelled()) return
        if (insErr) throw new Error(`建立門市失敗：${insErr.message}`)
        storeId = ins?.id ?? null
        storeName = ins?.name ?? (meta.store_name ?? '未命名店家')
      }
    }

    if (!storeId) throw new Error('未能取得 store_id')

    // 4) upsert store_accounts by store_id（啟用帳號，供登入檢查）
    const { error: accErr } = await supabase
      .from('store_accounts')
      .upsert(
        [{
          store_id: storeId,
          email,
          store_name: storeName ?? meta.store_name ?? '未命名店家',
          is_active: true,
          trial_start_at: null,
          trial_end_at: null,
        }],
        { onConflict: 'store_id', ignoreDuplicates: false }
      )
    if (isCancelled()) return
    if (accErr) throw new Error(`建立店家帳號失敗：${accErr.message}`)
  }

  useEffect(() => {
    if (!router.isReady) return
    let cancelled = false
    const isCancelled = () => cancelled

    const run = async () => {
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

        try {
          setState({ status: 'inserting' })
          await bootstrapStoreAndAccount(isCancelled)
        } catch (e: any) {
          setState({ status: 'error', message: e?.message || '資料同步失敗' })
          return
        }

        setState({ status: 'success', message: '驗證成功，資料已建立，正在導向登入頁…' })
        setTimeout(() => { if (!isCancelled()) router.replace('/login') }, 900)
        return
      }

      // 2) 無 ?code= → 等 SDK 解析 #access_token（/lib/supabaseClient.ts 已開 detectSessionInUrl）
      setState({ status: 'waiting' })
      const deadline = Date.now() + 3000
      while (!isCancelled() && Date.now() < deadline) {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          try {
            setState({ status: 'inserting' })
            await bootstrapStoreAndAccount(isCancelled)
          } catch (e: any) {
            setState({ status: 'error', message: e?.message || '資料同步失敗' })
            return
          }

          setState({ status: 'success', message: '登入完成，資料已同步，正在導向登入頁…' })
          setTimeout(() => { if (!isCancelled()) router.replace('/login') }, 800)
          return
        }
        await new Promise(r => setTimeout(r, 150))
      }

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
