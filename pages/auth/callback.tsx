// /pages/auth/callback.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

/**
 * 前提（DB 與 RLS）：
 * - stores: user_id uuid UNIQUE, email text UNIQUE, 其他欄位(name/owner_name/phone)
 * - store_accounts: store_id uuid UNIQUE(或唯一索引), email text UNIQUE
 * - 若啟用 RLS：
 *   stores 需允許本人 select/insert/update，且允許 user_id IS NULL 的列被本人「認領」；
 *   store_accounts 需允許本人對屬於自己的 store_id 做 select/insert/update，
 *   並允許「認領」(同 email 舊列 -> 更新為本人 store_id)。
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
  const ranRef = useRef(false) // ✅ 一次執行防抖

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
   * 建立/同步：stores（以 user_id）→ 取回 store_id → 建立/同步 store_accounts（先查再更新，最後插入）
   * 並於最後做一次「確認查詢」，確保 store_accounts 已存在且啟用。
   */
  const bootstrapStoreAndAccount = async () => {
    // 取得使用者
    const { data: ures, error: uerr } = await supabase.auth.getUser()
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

    {
      const { error } = await supabase
        .from('stores')
        .upsert([storePayload], { onConflict: 'user_id', ignoreDuplicates: false })
      if (error) throw new Error(`建立門市失敗：${error.message}`)
    }

    // 2) 取回 store_id
    const { data: storeRow, error: findStoreErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (findStoreErr || !storeRow?.id) {
      throw new Error(`查詢門市失敗：${findStoreErr?.message || '未取得 store_id'}`)
    }
    const storeId = storeRow.id
    const storeName = storeRow.name ?? meta.store_name ?? '未命名店家'

    // 3) store_accounts：先查 store_id 是否已有
    const { data: accByStore, error: findAccByStoreErr } = await supabase
      .from('store_accounts')
      .select('id')
      .eq('store_id', storeId)
      .maybeSingle()
    if (findAccByStoreErr) {
      throw new Error(`查詢店家帳號失敗：${findAccByStoreErr.message}`)
    }

    if (accByStore?.id) {
      // 3-1) 已有同 store_id 的帳號 → 更新為啟用
      const { error: updErr } = await supabase
        .from('store_accounts')
        .update({ email, store_name: storeName, is_active: true })
        .eq('id', accByStore.id)
      if (updErr) throw new Error(`更新店家帳號失敗：${updErr.message}`)
    } else {
      // 4) 查 email（避免撞到 UNIQUE(email)）
      const { data: accByEmail, error: findAccByEmailErr } = await supabase
        .from('store_accounts')
        .select('id, store_id')
        .eq('email', email)
        .maybeSingle()
      if (findAccByEmailErr) {
        throw new Error(`查詢帳號(email)失敗：${findAccByEmailErr.message}`)
      }

      if (accByEmail?.id) {
        // 4-1) 有同 email 舊資料 → 認領/對齊到本 store_id
        const { error: claimErr } = await supabase
          .from('store_accounts')
          .update({ store_id: storeId, store_name: storeName, is_active: true })
          .eq('id', accByEmail.id)
        if (claimErr) throw new Error(`認領店家帳號失敗：${claimErr.message}`)
      } else {
        // 5) 兩者都沒有 → 插入新帳號
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
        if (insAccErr) throw new Error(`建立店家帳號失敗：${insAccErr.message}`)
      }
    }

    // 6) 最終確認：真的有可用帳號
    const { data: finalAcc, error: finalErr } = await supabase
      .from('store_accounts')
      .select('id, is_active')
      .eq('store_id', storeId)
      .maybeSingle()
    if (finalErr || !finalAcc?.id) {
      throw new Error(`確認店家帳號失敗：${finalErr?.message || '未找到對應帳號'}`)
    }
    if (finalAcc.is_active !== true) {
      throw new Error('店家帳號未啟用（is_active != true）')
    }
  }

  useEffect(() => {
    if (!router.isReady || ranRef.current) return
    ranRef.current = true

    const run = async () => {
      try {
        if (errorDescription) {
          setState({ status: 'error', message: decodeURIComponent(errorDescription) })
          return
        }

        // 1) 有 ?code= → 換 session
        if (code) {
          setState({ status: 'exchanging' })
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exErr) {
            setState({ status: 'error', message: `驗證失敗：${exErr.message}` })
            return
          }
          setState({ status: 'inserting' })
          await bootstrapStoreAndAccount()
          setState({ status: 'success', message: '驗證成功，資料已建立，正在導向登入頁…' })
          // ✅ 直接導頁：不再檢查 cancelled，避免 unmount 造成不跳轉
          window.location.replace('/login')
          return
        }

        // 2) 無 ?code= → 等 SDK 解析 #access_token（/lib/supabaseClient.ts 已開 detectSessionInUrl）
        setState({ status: 'waiting' })
        const deadline = Date.now() + 3000
        while (Date.now() < deadline) {
          const { data } = await supabase.auth.getSession()
          if (data.session) {
            setState({ status: 'inserting' })
            await bootstrapStoreAndAccount()
            setState({ status: 'success', message: '登入完成，資料已同步，正在導向登入頁…' })
            window.location.replace('/login')
            return
          }
          await new Promise((r) => setTimeout(r, 150))
        }

        setState({
          status: 'error',
          message: '驗證代碼遺失或連結無效，請回到註冊/登入頁重新取得驗證信。',
        })
      } catch (e: any) {
        setState({ status: 'error', message: e?.message || '資料同步失敗' })
      }
    }

    void run()
  }, [router.isReady, code, errorDescription])

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
