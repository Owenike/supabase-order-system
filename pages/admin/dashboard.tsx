// pages/admin/dashboard.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

interface StoreAccount {
  id: string
  email: string
  store_name: string
  is_active: boolean
  created_at: string
}

export default function AdminDashboard() {
  const router = useRouter()

  // auth 狀態
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // 資料與 UI 狀態
  const [stores, setStores] = useState<StoreAccount[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string>('')

  /** 檢查是否為管理員（metadata / app_metadata / platform_admins 任一皆可） */
  const checkAdmin = useCallback(async (): Promise<boolean> => {
    // 1) 先確認是否登入
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return false

    // 2) 取得 user 詳細資料
    const { data: ures } = await supabase.auth.getUser()
    const user = ures?.user
    if (!user?.email) return false

    // 3) email 是否驗證
    const confirmed =
      (user as any).email_confirmed_at ||
      (user as any).confirmed_at ||
      user.email_confirmed_at
    if (!confirmed) return false

    // 4) metadata / app_metadata 判斷
    const metaRole: string | undefined = (user as any)?.user_metadata?.role
    const appRoles: string[] | undefined = (user as any)?.app_metadata?.roles
    if (metaRole === 'admin' || (Array.isArray(appRoles) && appRoles.includes('admin'))) {
      return true
    }

    // 5) （可選）白名單表 platform_admins（若沒有這張表，查詢失敗會被忽略）
    try {
      const { data: row, error } = await supabase
        .from('platform_admins')
        .select('email')
        .eq('email', user.email.toLowerCase())
        .maybeSingle()
      if (!error && row?.email) return true
    } catch {
      // 沒有這張表或 RLS 限制就忽略
    }

    return false
  }, [])

  /** 讀取店家帳號列表 */
  const fetchStores = useCallback(async () => {
    setLoading(true)
    setErrMsg('')

    const { data, error } = await supabase
      .from('store_accounts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('載入失敗', error.message)
      setErrMsg('載入失敗，請稍後再試')
      setStores([])
    } else {
      setStores(data || [])
    }

    setLoading(false)
  }, [])

  /** 初始流程：先檢查 admin 身份，再載入列表；不是 admin 就導回登入 */
  useEffect(() => {
    let mounted = true
    const run = async () => {
      const ok = await checkAdmin()
      if (!mounted) return
      setIsAdmin(ok)
      setAuthChecked(true)

      if (!ok) {
        const next = encodeURIComponent('/admin/dashboard')
        router.replace(`/admin/login?next=${next}`)
        return
      }
      await fetchStores()
    }
    run()

    // 若登入狀態改變，保持安全
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        router.replace('/admin/login')
      }
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [checkAdmin, fetchStores, router])

  /** 停用 / 啟用 */
  const toggleActive = async (id: string, current: boolean) => {
    setMutatingId(id)
    setErrMsg('')
    const { error } = await supabase.from('store_accounts').update({ is_active: !current }).eq('id', id)
    if (error) {
      console.error('更新失敗', error.message)
      setErrMsg('更新失敗，請稍後再試')
    } else {
      await fetchStores()
    }
    setMutatingId(null)
  }

  /** 刪除 */
  const deleteStore = async (id: string) => {
    if (!confirm('確定要刪除這個店家帳號嗎？此操作無法復原。')) return
    setMutatingId(id)
    setErrMsg('')
    const { error } = await supabase.from('store_accounts').delete().eq('id', id)
    if (error) {
      console.error('刪除失敗', error.message)
      setErrMsg('刪除失敗，請稍後再試')
    } else {
      await fetchStores()
    }
    setMutatingId(null)
  }

  // 尚未完成身份檢查 → 顯示安靜的載入狀態，避免閃跳
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center text-white/70">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/50 border-t-transparent mr-3" />
        <span>載入中…</span>
      </div>
    )
  }

  // 不是 admin（理論上已經被導回），這裡保險再擋一次
  if (!isAdmin) return null

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">🧾 店家帳號管理</h1>
          <button
            onClick={() => router.push('/admin/new-store')}
            className="px-4 py-2 rounded bg-amber-400 text-black font-semibold hover:bg-amber-500 transition"
          >
            ➕ 新增店家
          </button>
        </div>

        {errMsg && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-600/20 text-red-200 px-3 py-2 text-sm">
            {errMsg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center text-white/70">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/50 border-t-transparent mr-2" />
            讀取中…
          </div>
        ) : stores.length === 0 ? (
          <div className="text-white/70">目前沒有任何店家帳號。</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/80">
                <tr>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">店名</th>
                  <th className="text-left px-4 py-2">狀態</th>
                  <th className="text-left px-4 py-2">建立時間</th>
                  <th className="text-left px-4 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td className="px-4 py-2">{store.email}</td>
                    <td className="px-4 py-2">{store.store_name}</td>
                    <td className="px-4 py-2">{store.is_active ? '✅ 啟用' : '⛔ 停用'}</td>
                    <td className="px-4 py-2">
                      {new Date(store.created_at).toLocaleString('zh-TW', { hour12: false })}
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      <button
                        onClick={() => toggleActive(store.id, store.is_active)}
                        disabled={mutatingId === store.id}
                        className="text-xs px-3 py-1 rounded bg-yellow-500 text-black disabled:opacity-60"
                      >
                        {store.is_active ? '停用' : '啟用'}
                      </button>
                      <button
                        onClick={() => deleteStore(store.id)}
                        disabled={mutatingId === store.id}
                        className="text-xs px-3 py-1 rounded bg-red-600 text-white disabled:opacity-60"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
