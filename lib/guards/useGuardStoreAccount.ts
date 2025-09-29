// /lib/guards/useGuardStoreAccount.ts
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

/** 到期判斷：以日期日界比較（到期日當天仍可用） */
export function isExpired(endISO: string | null): boolean {
  if (!endISO) return false
  const end = new Date(endISO)
  if (Number.isNaN(end.getTime())) return false
  const today = new Date()
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return end < today
}
function isUUIDv4Like(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export type GuardBehavior = 'block' | 'warn'
export interface UseGuardOptions {
  behavior?: GuardBehavior
  onFailRedirectTo?: string
  inactiveMessage?: string
  expiredMessage?: string
  pendingMessage?: string   // 多門市未核可時的提示
}
export interface UseGuardResult {
  guarding: boolean
  storeId: string | null
  accountId: string | null
  isInactive: boolean
  isExpiredFlag: boolean
  error: string | null
  signOutAndGoLogin: () => Promise<void>
}

export function useGuardStoreAccount(opts: UseGuardOptions = {}): UseGuardResult {
  const {
    behavior = 'block',
    onFailRedirectTo = '/login',
    inactiveMessage = '此帳號已被停用，請聯繫管理員',
    expiredMessage = '此帳號使用期限已到期，請聯繫管理員延長期限',
    pendingMessage = '此 Email 的店家帳號已對應到多家門市，尚未核可。請聯繫管理員。',
  } = opts

  const router = useRouter()
  const [guarding, setGuarding] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [isInactive, setIsInactive] = useState(false)
  const [isExpiredFlag, setIsExpiredFlag] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signOutAndGoLogin = useMemo(
    () => async () => {
      try { await supabase.auth.signOut() } catch {}
      try { if (typeof window !== 'undefined') localStorage.clear() } catch {}
      router.replace(onFailRedirectTo)
    },
    [router, onFailRedirectTo]
  )

  useEffect(() => {
    let aborted = false
    const run = async () => {
      setError(null)
      setGuarding(true)

      // 1) 取得登入 session
      const { data: { session } } = await supabase.auth.getSession()
      if (aborted) return
      if (!session?.user?.email) { await signOutAndGoLogin(); return }
      const email = session.user.email.trim().toLowerCase()

      // 2) 查同 email 的所有 store_accounts
      const { data: rows, error: qErr } = await supabase
        .from('store_accounts')
        .select('id, store_id, is_active, trial_end_at, is_primary, created_at')
        .ilike('email', email)
        .order('created_at', { ascending: false })
      if (aborted) return
      if (qErr) { setError(qErr.message); await signOutAndGoLogin(); return }

      const accounts = rows || []
      if (accounts.length === 0) { setError('此帳號尚未綁定店家'); await signOutAndGoLogin(); return }

      // 3) 選定要放行的帳號
      const primary = accounts.find(a => a.is_primary)
      let acct = primary || accounts[0]

      // 多筆且沒有 primary → 擋下（等待管理員核可）
      if (accounts.length > 1 && !primary) {
        alert(pendingMessage)
        await signOutAndGoLogin()
        return
      }

      // 4) 狀態／期限
      const inactive = !acct.is_active
      const expired = isExpired(acct.trial_end_at as string | null)

      if (behavior === 'block') {
        if (inactive) { alert(inactiveMessage); await signOutAndGoLogin(); return }
        if (expired)  { alert(expiredMessage);  await signOutAndGoLogin(); return }
      } else {
        setIsInactive(inactive)
        setIsExpiredFlag(expired)
      }

      // 5) 校正 localStorage 為「被核可的那一家」
      try {
        const cur = typeof window !== 'undefined' ? localStorage.getItem('store_id') : null
        if (cur !== acct.store_id || !isUUIDv4Like(cur || '')) {
          if (typeof window !== 'undefined') localStorage.setItem('store_id', acct.store_id)
        }
        if (typeof window !== 'undefined') localStorage.setItem('store_account_id', acct.id)
      } catch {}

      setStoreId(acct.store_id)
      setAccountId(acct.id)
      setGuarding(false)
    }

    void run()
    return () => { aborted = true }
  }, [behavior, expiredMessage, inactiveMessage, pendingMessage, signOutAndGoLogin])

  return { guarding, storeId, accountId, isInactive, isExpiredFlag, error, signOutAndGoLogin }
}
