import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function StoreOrdersPage() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')
  const [lang, setLang] = useState<'zh' | 'en'>('zh')

  const t = {
    zh: {
      title: '訂單管理',
      all: '全部',
      pending: '未處理',
      completed: '已完成',
      complete: '完成訂單',
      table: '桌號',
      takeout: '外帶',
      items: '品項',
      spicy: '辣度',
      note: '備註',
      done: '✅ 已完成',
      noOrders: '目前沒有訂單',
      noPending: '🔔 無未處理訂單',
    },
    en: {
      title: 'Order Management',
      all: 'All',
      pending: 'Pending',
      completed: 'Completed',
      complete: 'Mark Done',
      table: 'Table',
      takeout: 'Takeout',
      items: 'Items',
      spicy: 'Spicy',
      note: 'Note',
      done: '✅ Done',
      noOrders: 'No orders currently',
      noPending: '🔔 No pending orders',
    },
  }[lang]

  useEffect(() => {
    const id = localStorage.getItem('store_id')
    if (!id) return
    setStoreId(id)
    fetchOrders(id)

    const interval = setInterval(() => {
      fetchOrders(id)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const fetchOrders = async (storeId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
    setOrders(data || [])
  }

  const handleComplete = async (id: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed' })
      .eq('id', id)

    if (error) {
      console.error('更新失敗：', error.message)
      alert('訂單更新失敗，請稍後再試')
      return
    }

    if (storeId) fetchOrders(storeId)
  }

  const filteredOrders = orders.filter(order => {
    if (filter === 'pending') return order.status !== 'completed'
    if (filter === 'completed') return order.status === 'completed'
    return true
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📦 {t.title}</h1>
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="text-sm border px-2 py-1 rounded"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={() => setFilter('all')} className={`px-4 py-1 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{t.all}</button>
        <button onClick={() => setFilter('pending')} className={`px-4 py-1 rounded ${filter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>{t.pending}</button>
        <button onClick={() => setFilter('completed')} className={`px-4 py-1 rounded ${filter === 'completed' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>{t.completed}</button>
      </div>

      {filteredOrders.length === 0 ? (
        <p className="text-gray-500">
          {filter === 'pending' ? t.noPending : t.noOrders}
        </p>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map(order => (
            <div key={order.id} className="border rounded-lg p-4 shadow hover:shadow-md transition">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-semibold">
                  {t.table}：{order.table_number === '外帶' ? t.takeout : order.table_number}
                </h2>
                {order.status === 'completed' && <span className="text-green-600 text-sm">{t.done}</span>}
              </div>

              <div className="text-sm text-gray-700 mb-1">
                <strong>{t.items}：</strong>
                {order.items?.map((item: any, idx: number) => (
                  <span key={idx}>{item.name} ×{item.quantity}&nbsp;</span>
                ))}
              </div>

              {order.spicy_level && (
                <div className="text-sm text-red-500">
                  <strong>{t.spicy}：</strong> {order.spicy_level}
                </div>
              )}

              {order.note && (
                <div className="text-sm text-gray-500">
                  <strong>{t.note}：</strong> {order.note}
                </div>
              )}

              {order.status !== 'completed' && (
                <button
                  onClick={() => handleComplete(order.id)}
                  className="mt-3 bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 active:scale-95 transition"
                >
                  {t.complete}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
