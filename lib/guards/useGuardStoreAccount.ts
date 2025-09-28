// /lib/guards/useGuardStoreAccount.ts
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

/**
 * 以「日界」比較的過期判斷（到期日當天仍可用）
 */
export function isExpired(endISO: string | null): boolean {
  if (!endISO) return false
  const end = new Date(endISO)
  if (Number.isNaN(end.getTime())) return false
  const today = new Date()
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return end < today
}

function isUUIDv4Like(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

/** Hook 的行為選項 */
export type GuardBehavior =
  | 'block'  // 停用/過期 → 直接登出 + 清 localStorage + 導回 /login（預設）
  | 'warn'   // 停用/過期 → 不登出，僅回傳 flags 讓頁面自己顯示警示橫幅

export interface UseGuardOptions {
  behavior?: GuardBehavior
  onFailRedirectTo?: string // 預設 '/login'
  // 若 behavior = 'warn' 時用的提示文字（可自訂在頁面使用）
  inactiveMessage?: string
  expiredMessage?: string
}

export interface UseGuardResult {
  guarding: boolean          // true 表示守門中（尚未放行）
  storeId: string | null
  accountId: string | null
  isInactive: boolean        // 僅 behavior = 'warn' 有意義
  isExpiredFlag: boolean     // 僅 behavior = 'warn' 有意義
  error: string | null
  /** 手動觸發登出 + 導回（行為統一） */
  signOutAndGoLogin: () => Promise<void>
}

/**
 * 統一檢查：
 * 1) Supabase Auth 是否登入
 * 2) localStorage.store_id 是否存在＆格式正確（UUID）
 * 3) store_accounts（is_active、trial_end_at）
 *
 * behavior = 'block'（預設）：
 *   若停用或過期，直接 alert + 登出 + 清 localStorage + 導回 /login
 * behavior = 'warn'：
 *   只回傳 isInactive/isExpiredFlag 讓頁面顯示橫幅，不強制登出
 */
export function useGuardStoreAccount(opts: UseGuardOptions = {}): UseGuardResult {
  const {
    behavior = 'block',
    onFailRedirectTo = '/login',
    inactiveMessage = '此帳號已被停用，請聯繫管理員',
    expiredMessage = '此帳號使用期限已到期，請聯繫管理員延長期限',
  } = opts

  const router = useRouter()
  const [guarding, setGuarding] = useState<boolean>(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [isInactive, setIsInactive] = useState<boolean>(false)
  const [isExpiredFlag, setIsExpiredFlag] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const signOutAndGoLogin = useMemo(() => {
    return async () => {
      try {
        await supabase.auth.signOut()
      } catch {}
      try {
        localStorage.clear()
      } catch {}
      router.replace(onFailRedirectTo)
    }
  }, [router, onFailRedirectTo])

  useEffect(() => {
    let aborted = false

    const run = async () => {
      setError(null)
      setGuarding(true)

      // 1) Auth 檢查
      const { data: { session }, error: sErr } = await supabase.auth.getSession()
      if (aborted) return
      if (sErr) {
        setError(sErr.message || '無法取得登入狀態')
      }
      if (!session || !session.user) {
        await signOutAndGoLogin()
        return
      }

      // 2) store_id 檢查
      let sid: string | null = null
      try {
        sid = localStorage.getItem('store_id')
      } catch {
        sid = null
      }
      if (!sid || !isUUIDv4Like(sid)) {
        await signOutAndGoLogin()
        return
      }

      // 3) 查 store_accounts 狀態
      const { data: accountRow, error: accErr } = await supabase
        .from('store_accounts')
        .select('id, is_active, trial_end_at')
        .eq('store_id', sid)
        .maybeSingle()

      if (aborted) return

      if (accErr || !accountRow?.id) {
        setError(accErr?.message || '此店家尚未啟用帳號')
        await signOutAndGoLogin()
        return
      }

      const inactive = !accountRow.is_active
      const expired = isExpired(accountRow.trial_end_at as string | null)

      if (behavior === 'block') {
        if (inactive) {
          alert(inactiveMessage)
          await signOutAndGoLogin()
          return
        }
        if (expired) {
          alert(expiredMessage)
          await signOutAndGoLogin()
          return
        }
      } else {
        // warn：回傳旗標給頁面自行處理
        setIsInactive(inactive)
        setIsExpiredFlag(expired)
      }

      // 通過
      try {
        localStorage.setItem('store_account_id', accountRow.id)
      } catch {}
      setStoreId(sid)
      setAccountId(accountRow.id)
      setGuarding(false)
    }

    void run()
    return () => { aborted = true }
  }, [behavior, expiredMessage, inactiveMessage, signOutAndGoLogin])

  return {
    guarding,
    storeId,
    accountId,
    isInactive,
    isExpiredFlag,
    error,
    signOutAndGoLogin,
  }
}
