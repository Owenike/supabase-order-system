// /pages/auth/callback.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import { isExpired } from '@/lib/guards/useGuardStoreAccount'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [msg, setMsg] = useState('處理中，請稍候…')

  useEffect(() => {
    let aborted = false
    const run = async () => {
      setMsg('驗證登入狀態…')
      const { data: { session } } = await supabase.auth.getSession()
      if (aborted) return

      if (!session?.user?.email) {
        setMsg('尚未登入，將返回登入頁…')
        setTimeout(() => router.replace('/login'), 800)
        return
      }
      const email = session.user.email.trim().toLowerCase()

      setMsg('同步店家資訊…')
      const { data: rows, error } = await supabase
        .from('store_accounts')
        .select('id, store_id, is_active, trial_end_at, is_primary, created_at')
        .ilike('email', email)
        .order('created_at', { ascending: false })

      if (aborted) return

      if (error || !rows || rows.length === 0) {
        setMsg('找不到對應的店家帳號')
        setTimeout(() => router.replace('/login'), 1200)
        return
      }

      const primary = rows.find(r => r.is_primary)
      if (rows.length > 1 && !primary) {
        alert('此 Email 的店家帳號已對應到多家門市，尚未核可。請聯繫管理員。')
        await supabase.auth.signOut().catch(() => {})
        try { localStorage.clear() } catch {}
        router.replace('/login')
        return
      }

      const acct = primary || rows[0]

      if (!acct.is_active) {
        alert('此帳號已被停用，請聯繫管理員')
        await supabase.auth.signOut().catch(() => {})
        try { localStorage.clear() } catch {}
        router.replace('/login')
        return
      }

      if (isExpired(acct.trial_end_at as string | null)) {
        alert('此帳號使用期限已到期，請聯繫管理員延長期限')
        await supabase.auth.signOut().catch(() => {})
        try { localStorage.clear() } catch {}
        router.replace('/login')
        return
      }

      try {
        localStorage.setItem('store_id', acct.store_id)
        localStorage.setItem('store_account_id', acct.id)
      } catch {}

      setMsg('完成，正在前往後台…')
      router.replace('/store')
    }

    void run()
    return () => { aborted = true }
  }, [router])

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0B0B0B] text-white">
      <div className="rounded-xl border border-white/15 bg-white/5 px-6 py-4 shadow">
        {msg}
      </div>
    </main>
  )
}
