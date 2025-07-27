'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/router'

type Store = {
  id: string
  name: string
  email: string
  phone: string
  is_active: boolean
  created_at: string
}

export default function StoreListPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  const fetchStores = async () => {
    const session = await supabase.auth.getSession()
    if (!session.data.session || session.data.session.user.user_metadata?.role !== 'admin') {
      router.replace('/admin/login')
      return
    }

    const { data, error } = await supabase
      .from('stores')
      .select('id, name, email, phone, is_active, created_at')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setStores(data as Store[])
    setLoading(false)
  }

  useEffect(() => {
    fetchStores()
  }, [router])

  const handleDelete = async (email: string, store_id: string) => {
    const confirm = window.confirm(`你確定要刪除 ${email} 的帳號嗎？此操作無法還原`)
    if (!confirm) return

    const res = await fetch('/api/delete-store', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, store_id }),
    })

    const result = await res.json()
    if (res.ok) {
      alert('✅ 刪除成功！')
      setStores((prev) => prev.filter((s) => s.id !== store_id))
    } else {
      alert('❌ 刪除失敗：' + result.error)
    }
  }

  const handleToggleActive = async (email: string, store_id: string, newStatus: boolean) => {
    const res = await fetch('/api/toggle-store-active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, store_id, is_active: newStatus }),
    })

    const result = await res.json()
    if (res.ok) {
      setStores((prev) =>
        prev.map((store) =>
          store.id === store_id ? { ...store, is_active: newStatus } : store
        )
      )
    } else {
      alert('❌ 操作失敗：' + result.error)
    }
  }

  return (
    <div className="max-w-4xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-6">📋 店家清單</h1>
      {loading && <p>讀取中...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && stores.length === 0 && <p>目前沒有店家</p>}
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">店名</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">電話</th>
            <th className="p-2 text-center">操作</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => (
            <tr key={store.id} className="border-t">
              <td className="p-2">{store.name}</td>
              <td className="p-2">{store.email}</td>
              <td className="p-2">{store.phone}</td>
              <td className="p-2 space-x-2 text-center">
                <button
                  onClick={() => handleToggleActive(store.email, store.id, !store.is_active)}
                  className={`px-3 py-1 rounded font-medium ${
                    store.is_active
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {store.is_active ? '暫停' : '啟用'}
                </button>
                <button
                  onClick={() => handleDelete(store.email, store.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                >
                  刪除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
