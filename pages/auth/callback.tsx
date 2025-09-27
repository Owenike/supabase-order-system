// /pages/auth/callback.tsx
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

/**
 * 前提（請確認 DB 已備好，否則 upsert 會失敗）：
 * 1) stores 表包含欄位：user_id uuid, name text, owner_name text, phone text, email text
 * 2) stores.user_id 有唯一鍵（或唯一索引），例：
 *    alter table public.stores add constraint stores_user_id_key unique (user_id);
 * 3) store_accounts 表包含欄位：store_id uuid, email text, store_name text, is_active bool, trial_start_at timestamptz, trial_end_at timestamptz
 * 4) store_accounts.store_id 有唯一索引（或唯一鍵），例：
 *    create unique index if not exists store_accounts_store_id_key_idx on public.store_accounts (store_id);
 * 5) 若開 RLS，需允許本人 insert/select 對這兩張表
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
   * 建立/同步：stores（以 user_id）→ 取回 store_id → 建立/同步 store_accounts（以 store_id）
   */
  const bootstrapStoreAndAccount = async (isCancelled: () => boolean) => {
    // 取得使用者
    const { data: ures, error: uerr } = await supabase.auth.getUser()
    if (isCancelled()) return
    if (uerr || !ures?.user) throw new Error(uerr?.message || '取得使用者失敗')

    const user = ures.user
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
      email: user.email ?? null,
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

    // 3) upsert store_accounts by store_id（確保登入頁能查到帳號且啟用）
    const accountPayload = {
      store_id: storeRow.id,
      email: user.email ?? null,
      store_name: storeRow.name ?? meta.store_name ?? '未命名店家',
      is_active: true,
      trial_start_at: null,
      trial_end_at: null,
    }

    const { error: accErr } = await supabase
      .from('store_accounts')
      .upsert([accountPayload], { onConflict: 'store_id', ignoreDuplicates: false })
    if (isCancelled()) return
    if (accErr) throw new Error(`建立店家帳號失敗：${accErr.message}`)
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

      // 2) 沒有 ?code= → 等 SDK 解析 #access_token（/lib/supabaseClient.ts 已開 detectSessionInUrl）
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

      // 3) 仍無 session → 視為連結無效或被預抓
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
