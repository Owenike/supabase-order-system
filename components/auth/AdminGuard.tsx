// components/auth/AdminGuard.tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

type Props = { children: ReactNode }

/**
 * AdminGuard：等 auth 載入 → 檢查登入 → 檢查是否管理員 → 才渲染內容
 * 判斷規則（任一成立即通過）：
 * 1) user.user_metadata.role === 'admin'
 * 2) user.app_metadata.roles includes 'admin'
 * 3) 資料表 platform_admins 有該 email（若沒有這張表，查詢會被忽略、不擋住）
 */
export default function AdminGuard({ children }: Props) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      // 1) 等拿到 session
      const { data: sess } = await supabase.auth.getSession()
      const session = sess.session
      if (!mounted) return

      if (!session) {
        // 未登入 → 帶 next 參數回到 admin/login
        const next = encodeURIComponent(router.asPath)
        router.replace(`/admin/login?next=${next}`)
        return
      }

      // 2) 取 user
      const { data: ud } = await supabase.auth.getUser()
      const user = ud?.user
      if (!mounted) return

      if (!user?.email) {
        const next = encodeURIComponent(router.asPath)
        router.replace(`/admin/login?next=${next}`)
        return
      }

      // 3) Email 是否驗證
      const confirmed =
        (user as any).email_confirmed_at ||
        (user as any).confirmed_at ||
        user.email_confirmed_at
      if (!confirmed) {
        await supabase.auth.signOut().catch(() => void 0)
        router.replace('/admin/login')
        return
      }

      // 4) 管理員判定（metadata / app_metadata / 平台白名單表）
      const metaRole: string | undefined = (user as any)?.user_metadata?.role
      const appRoles: string[] | undefined = (user as any)?.app_metadata?.roles

      let isAdmin =
        metaRole === 'admin' ||
        (Array.isArray(appRoles) && appRoles.includes('admin'))

      if (!isAdmin) {
        try {
          const { data: row, error } = await supabase
            .from('platform_admins')
            .select('email')
            .eq('email', user.email.toLowerCase())
            .maybeSingle()
          if (!error && row?.email) isAdmin = true
        } catch {
          // 沒有這張表就忽略
        }
      }

      if (!mounted) return

      setAllowed(isAdmin)
      setChecked(true)

      if (!isAdmin) {
        // 非管理員 → 登出並回登入頁
        await supabase.auth.signOut().catch(() => void 0)
        router.replace('/admin/login')
      }
    }

    run()

    // 監聽後續狀態變更（避免背景失效）
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) {
        router.replace('/admin/login')
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  // 還在檢查 → 給個安靜的 loading 區塊（避免閃回）
  if (!checked) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-white/70">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/50 border-t-transparent mr-3" />
        <span>載入中…</span>
      </div>
    )
  }

  if (!allowed) return null
  return <>{children}</>
}
