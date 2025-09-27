// /pages/auth/callback.tsx
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

/**
 * 前提（請確認 DB 已備好，否則 upsert/更新會失敗）：
 * 1) stores: user_id uuid UNIQUE, email text UNIQUE, 其餘欄位自由
 * 2) store_accounts: store_id uuid UNIQUE（或唯一索引），email text UNIQUE（全域唯一）
 * 3) 若啟用 RLS：
 *    - stores：本人可 select/insert/update；且允許「user_id IS NULL 的列」被本人認領（前面你已設定）
 *    - store_accounts：暫時放寬 for all using(true) 以測通；要收斂見文末 B-1
 */

type ViewState =
  | { status: 'idle' }
  | { status: 'exchanging' }   // 以 ?code= 交換 session
  | { status: 'waiting' }      // 等 SDK 解析 #access_token
  | { status: 'inserting' }    // 建立/同步 stores + store_accounts
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

  /**
   * 建立/同步：stores（以 user_id）→ 取回 store_id → 建立/同步 store_accounts（先查再更新，最後插入）
   */
  const bootstrapStoreAndAccount = async (isCancelled: () => boolean) => {
    // 取得使用者
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

    // 1) upsert stores by user_id
    const storePayload = {
      user_id: user.id,
      name: meta.store_name ?? '未命名店家',
      owner_name: meta.owner_name ?? null,
      phone: meta.phone ?? null,
      email,
    }

    const { error: storeUpsertErr } = await supabase
      .from('stores')
      .upsert([storePayload], { onConflict: 'user_id', ignoreDuplicates: false })
    if (isCancelled()) return
    if (storeUpsertErr) throw new Error(`建立門市失敗：${storeUpsertErr.message}`)

    // 2) 取回 store_id
    const { data: storeRow, error: findStoreErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (isCancelled()) return
    if (findStoreErr || !storeRow?.id) throw new Error(`查詢門市失敗：${findStoreErr?.message || '未取得 store_id'}`)

    const storeId = storeRow.id
    const storeName = storeRow.name ?? meta.store_name ?? '未命名店家'

    // 3) store_accounts：先查 store_id
    const { data: accByStore, error: findAccByStoreErr } = await supabase
      .from('store_accounts')
      .select('id')
      .eq('store_id', storeId)
      .maybeSingle()
    if (isCancelled()) return
    if (findAccByStoreErr) throw new Error(`查詢店家帳號失敗：${findAccByStoreErr.message}`)

    if (accByStore?.id) {
      // 3-1) 已有同 store_id 的帳號 → 直接更新為啟用
      const { error: updErr } = await supabase
        .from('store_accounts')
        .update({
          email,
          store_name: storeName,
          is_active: true,
        })
        .eq('id', accByStore.id)
      if (isCancelled()) return
      if (updErr) throw new Error(`更新店家帳號失敗：${updErr.message}`)
      return
    }

    // 4) 再查 email（避免撞到 UNIQUE(email)）
    const { data: accByEmail, error: findAccByEmailErr } = await supabase
      .from('store_accounts')
      .select('id, store_id')
      .eq('email', email)
      .maybeSingle()
    if (isCancelled()) return
    if (findAccByEmailErr) throw new Error(`查詢帳號(email)失敗：${findAccByEmailErr.message}`)

    if (accByEmail?.id) {
      // 4-1) 有同 email 的舊資料 → 認領/對齊到本 store_id
      const { error: claimErr } = await supabase
        .from('store_accounts')
        .update({
          store_id: storeId,
          store_name: storeName,
          is_active: true,
        })
        .eq('id', accByEmail.id)
      if (isCancelled()) return
      if (claimErr) throw new Error(`認領店家帳號失敗：${claimErr.message}`)
      return
    }

    // 5) 兩者都沒有 → 插入新帳號（此時不會撞到 UNIQUE(email)）
    const { error: insAccErr } = await supabase
      .from('store_accounts')
      .insert({
        store_id: storeId,
        email,
        store_name: storeName,
        is_active: true,
        trial_start_at: null,
        trial_end_at: null,
      })
    if (isCancelled()) return
    if (insAccErr) throw new Error(`建立店家帳號失敗：${insAccErr.message}`)
  }

  const [stateOnce, setStateOnce] = useState(false)

  useEffect(() => {
    if (!router.isReady || stateOnce) return
    setStateOnce(true)

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
        await new Promise((r) => setTimeout(r, 150))
      }

      setState({
        status: 'error',
        message: '驗證代碼遺失或連結無效，請回到註冊/登入頁重新取得驗證信。',
      })
    }

    void run()
    return () => { cancelled = true }
  }, [router.isReady, code, errorDescription, router, stateOnce])

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
