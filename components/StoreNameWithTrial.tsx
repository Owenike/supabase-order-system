// /components/StoreNameWithTrial.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatROCRange } from '@/lib/date'

type StoreRow = {
  id: string
  name: string
  trial_start_at: string | null
  trial_end_at: string | null
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

export default function StoreNameWithTrial() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [store, setStore] = useState<StoreRow | null>(null)

  // 顯示字串（含期限）
  const title = useMemo(() => {
    if (!store) return ''
    const base = store.name || '（未命名店家）'
    const s = store.trial_start_at
    const e = store.trial_end_at
    const range = s && e ? `（期限${formatROCRange(s, e)}）` : ''
    return `${base} ${range}`
  }, [store])

  const expired = useMemo(() => {
    if (!store?.trial_end_at) return false
    return Date.now() > new Date(store.trial_end_at).getTime()
  }, [store])

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError('')

        // 1) 找目前登入者
        const { data: sess } = await supabase.auth.getSession()
        const user = sess.session?.user
        if (!user?.email) {
          // 未登入就嘗試從 localStorage / cookie 拿 store_id（若你有先存）
          const ls =
            typeof window !== 'undefined'
              ? window.localStorage.getItem('order_store') ||
                window.localStorage.getItem('store_id') ||
                ''
              : ''
          const ck = getCookie('store_id') || ''
          const sid = (ls || ck).trim()
          if (!sid) {
            setError('尚未登入'); setLoading(false); return
          }
          const { data: s1, error: e1 } = await supabase
            .from('stores')
            .select('id,name,trial_start_at,trial_end_at')
            .eq('id', sid)
            .maybeSingle()
          if (e1) throw e1
          setStore((s1 as StoreRow) || null)
          setLoading(false)
          return
        }

        // 2) 由 email → store_user_links 取得 store_id
        const { data: link, error: linkErr } = await supabase
          .from('store_user_links')
          .select('store_id')
          .eq('email', user.email)
          .maybeSingle()
        if (linkErr) throw linkErr

        let storeId: string | undefined = link?.store_id
        if (!storeId && typeof window !== 'undefined') {
          // 後備來源：localStorage / cookie
          storeId =
            window.localStorage.getItem('order_store') ||
            window.localStorage.getItem('store_id') ||
            getCookie('store_id') ||
            undefined
        }
        if (!storeId) {
          setError('找不到所屬店家'); setLoading(false); return
        }

        // 3) 查店家資料（含試用期）
        const { data: s2, error: sErr } = await supabase
          .from('stores')
          .select('id,name,trial_start_at,trial_end_at')
          .eq('id', storeId)
          .maybeSingle()
        if (sErr) throw sErr

        setStore((s2 as StoreRow) || null)
        setLoading(false)
      } catch (e: any) {
        setError(e?.message || '載入失敗')
        setLoading(false)
      }
    }
    void run()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-white/80">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/60 border-t-transparent" />
        <span>載入店家資訊…</span>
      </div>
    )
  }

  if (error || !store) {
    return <div className="text-red-300 text-sm">店家資訊載入失敗：{error || '未知錯誤'}</div>
  }

  return (
    <div className="flex items-center gap-3">
      {/* 你的店徽若有可放這裡 */}
      {/* <img src="/logo.png" className="h-8 w-8 rounded-full" alt="" /> */}
      <div className="text-white text-lg sm:text-xl font-semibold">
        您的店家名稱：{title}
        {expired && <span className="ml-2 text-red-400 text-sm">（已到期）</span>}
      </div>
    </div>
  )
}
