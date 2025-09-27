// /pages/auth/callback.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

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
  const ranRef = useRef(false)

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

  const bootstrapStoreAndAccount = async () => {
    // 取得使用者
    const { data: ures, error: uerr } = await supabase.auth.getUser()
    if (uerr || !ures?.user) throw new Error(uerr?.message || '取得使用者失敗')
    const user = ures.user
    const email = (user.email ?? '').toLowerCase().trim()
    const meta = (user.user_metadata ?? {}) as { store_name?: string; owner_name?: string; phone?: string }

    // ---------- stores：先 user_id，再 email，最後 insert ----------
    // 1) 用 user_id 找
    const { data: sByUid, error: sByUidErr } = await supabase
      .from('stores').select('id, name, user_id, email').eq('user_id', user.id).maybeSingle()
    if (sByUidErr) throw new Error(`查詢門市(user_id)失敗：${sByUidErr.message}`)

    let storeId = sByUid?.id ?? null
    let storeName = sByUid?.name ?? null

    if (!storeId) {
      // 2) 用 email 找（RLS 已放行以本人的 email 查詢）
      const { data: sByEmail, error: sByEmailErr } = await supabase
        .from('stores').select('id, name, user_id, email').eq('email', email).maybeSingle()
      if (sByEmailErr) throw new Error(`查詢門市(email)失敗：${sByEmailErr.message}`)

      if (sByEmail?.id) {
        // 2-1) 找到同 email
        if (sByEmail.user_id && sByEmail.user_id !== user.id) {
          // ✅ 這是「已被別的 user 綁住」的脫管資料 → 不要硬插，明確回報
          throw new Error('此 Email 已綁定於其他帳號，請改用其他 Email 或聯絡管理員協助合併。')
        }
        // 認領（把 user_id 補上）
        const { error: claimErr } = await supabase.from('stores').update({
          user_id: user.id,
          name: sByEmail.name ?? meta.store_name ?? '未命名店家',
          owner_name: meta.owner_name ?? null,
          phone: meta.phone ?? null,
        }).eq('id', sByEmail.id)
        if (claimErr) throw new Error(`認領門市失敗：${claimErr.message}`)
        storeId = sByEmail.id
        storeName = sByEmail.name ?? meta.store_name ?? '未命名店家'
      } else {
        // 3) 真的沒有 → 新建
        const insertPayload = {
          user_id: user.id,
          name: meta.store_name ?? '未命名店家',
          owner_name: meta.owner_name ?? null,
          phone: meta.phone ?? null,
          email,
        }
        const { data: sIns, error: sInsErr } = await supabase
          .from('stores').insert(insertPayload).select('id, name').maybeSingle()
        if (sInsErr) throw new Error(`建立門市失敗：${sInsErr.message}`)
        storeId = sIns?.id ?? null
        storeName = sIns?.name ?? (meta.store_name ?? '未命名店家')
      }
    }

    if (!storeId) throw new Error('未能取得 store_id')

    // ---------- store_accounts：先 by store_id，再 by email 認領，最後 insert ----------
    // 4) by store_id
    const { data: aByStore, error: aByStoreErr } = await supabase
      .from('store_accounts').select('id, store_id, email').eq('store_id', storeId).maybeSingle()
    if (aByStoreErr) throw new Error(`查詢店家帳號失敗：${aByStoreErr.message}`)

    if (aByStore?.id) {
      const { error: updErr } = await supabase.from('store_accounts').update({
        email, store_name: storeName ?? '未命名店家', is_active: true
      }).eq('id', aByStore.id)
      if (updErr) throw new Error(`更新店家帳號失敗：${updErr.message}`)
    } else {
      // 5) by email（避免撞 UNIQUE(email)）
      const { data: aByEmail, error: aByEmailErr } = await supabase
        .from('store_accounts').select('id, store_id').eq('email', email).maybeSingle()
      if (aByEmailErr) throw new Error(`查詢帳號(email)失敗：${aByEmailErr.message}`)

      if (aByEmail?.id) {
        // 有同 email → 若已綁到別的 store，不強改；若未綁或預期一致，認領
        if (aByEmail.store_id && aByEmail.store_id !== storeId) {
          throw new Error('此 Email 的店家帳號已綁定到其他門市，請聯絡管理員處理。')
        }
        const { error: claimAccErr } = await supabase.from('store_accounts').update({
          store_id: storeId, store_name: storeName ?? '未命名店家', is_active: true
        }).eq('id', aByEmail.id)
        if (claimAccErr) throw new Error(`認領店家帳號失敗：${claimAccErr.message}`)
      } else {
        // 6) 兩者都沒有 → 插入新帳號
        const { error: insAccErr } = await supabase.from('store_accounts').insert({
          store_id: storeId, email, store_name: storeName ?? '未命名店家',
          is_active: true, trial_start_at: null, trial_end_at: null
        })
        if (insAccErr) throw new Error(`建立店家帳號失敗：${insAccErr.message}`)
      }
    }

    // 最終確認
    const { data: finalAcc, error: finalErr } = await supabase
      .from('store_accounts').select('id, is_active').eq('store_id', storeId).maybeSingle()
    if (finalErr || !finalAcc?.id) throw new Error(`確認店家帳號失敗：${finalErr?.message || '未找到對應帳號'}`)
    if (finalAcc.is_active !== true) throw new Error('店家帳號未啟用（is_active != true）')
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

        if (code) {
          setState({ status: 'exchanging' })
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) { setState({ status: 'error', message: `驗證失敗：${error.message}` }); return }
          setState({ status: 'inserting' })
          await bootstrapStoreAndAccount()
          setState({ status: 'success', message: '驗證成功，資料已建立，正在導向登入頁…' })
          window.location.replace('/login')
          return
        }

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
          await new Promise(r => setTimeout(r, 150))
        }

        setState({ status: 'error', message: '驗證代碼遺失或連結無效，請回到註冊/登入頁重新取得驗證信。' })
      } catch (e: any) {
        setState({ status: 'error', message: e?.message || '資料同步失敗' })
      }
    }

    void run()
  }, [router.isReady, code, errorDescription])

  const boxClass =
    state.status === 'exchanging' || state.status === 'waiting' || state.status === 'inserting'
      ? 'border-white/20 bg-white/5'
      : state.status === 'success'
      ? 'border-emerald-400/30 bg-emerald-500/10'
      : state.status === 'error'
      ? 'border-red-400/30 bg-red-500/10'
      : 'border-white/10 bg-white/5'

  const message =
    state.status === 'exchanging' ? '驗證中，請稍候…'
    : state.status === 'waiting' ? '處理驗證連結中…'
    : state.status === 'inserting' ? '同步門市資料中…'
    : state.status === 'success' ? state.message
    : state.status === 'error' ? state.message
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
