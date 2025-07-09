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
  const [stores, setStores] = useState<StoreAccount[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const fetchStores = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('store_accounts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('載入失敗', error.message)
      setStores([])
    } else {
      setStores(data || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    const adminId = localStorage.getItem('admin_id')
    if (!adminId) {
      router.push('/admin/login')
      return
    }
    fetchStores()
  }, [router, fetchStores])

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('store_accounts')
      .update({ is_active: !current })
      .eq('id', id)

    if (error) {
      console.error('更新失敗', error.message)
      alert('更新失敗，請稍後再試')
    } else {
      fetchStores()
    }
  }

  const deleteStore = async (id: string) => {
    if (confirm('確定要刪除這個店家帳號嗎？')) {
      const { error } = await supabase
        .from('store_accounts')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('刪除失敗', error.message)
        alert('刪除失敗，請稍後再試')
      } else {
        fetchStores()
      }
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🧾 店家帳號管理</h1>

      <button
        onClick={() => router.push('/admin/new-store')}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        ➕ 新增店家
      </button>

      {loading ? (
        <p>讀取中...</p>
      ) : (
        <table className="w-full border mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">店名</th>
              <th className="text-left px-4 py-2">狀態</th>
              <th className="text-left px-4 py-2">建立時間</th>
              <th className="text-left px-4 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-t">
                <td className="px-4 py-2">{store.email}</td>
                <td className="px-4 py-2">{store.store_name}</td>
                <td className="px-4 py-2">
                  {store.is_active ? '✅ 啟用' : '⛔ 停用'}
                </td>
                <td className="px-4 py-2">
                  {new Date(store.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 space-x-2">
                  <button
                    onClick={() => toggleActive(store.id, store.is_active)}
                    className="text-sm px-3 py-1 rounded bg-yellow-500 text-white"
                  >
                    {store.is_active ? '停用' : '啟用'}
                  </button>
                  <button
                    onClick={() => deleteStore(store.id)}
                    className="text-sm px-3 py-1 rounded bg-red-600 text-white"
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
