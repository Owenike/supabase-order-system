// pages/login/line-success.tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

// ✅ Cookie 工具
function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`
}

interface Order {
  id: string
  created_at: string
  table_number: string
  total: number
  note?: string
  items: { name: string; quantity: number; price: number }[]
}

export default function LineSuccessPage() {
  const router = useRouter()
  const { line_user_id, name } = router.query
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    if (
      !router.isReady ||
      typeof line_user_id !== 'string'
    ) return

    // ✅ 儲存到 Cookie（取代 localStorage）
    setCookie('line_user_id', line_user_id)
    if (typeof name === 'string') setCookie('line_display_name', name)

    fetchOrders(line_user_id)

    // ⏳ 延遲跳轉回外帶點餐頁
    setTimeout(() => {
      const storeId = localStorage.getItem('store_id') || ''
      if (storeId) {
        router.push(`/order?store=${storeId}&table=外帶`)
      }
    }, 2000)
  }, [router, line_user_id, name])

  const fetchOrders = async (userId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('line_user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ 查詢訂單失敗', error.message)
    } else {
      setOrders(data || [])
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">👋 歡迎回來{name ? `，${name}` : ''}</h1>
      <p className="mb-4 text-gray-600">以下是你的歷史點餐紀錄：</p>

      {orders.length === 0 ? (
        <p className="text-gray-500">目前尚無訂單紀錄</p>
      ) : (
        <ul className="space-y-4">
          {orders.map(order => (
            <li key={order.id} className="border rounded p-4 shadow">
              <div className="text-sm text-gray-600 mb-1">時間：{new Date(order.created_at).toLocaleString()}</div>
              <div className="text-sm">桌號：{order.table_number}</div>
              <div className="text-sm">總計：NT$ {order.total}</div>
              {order.note && <div className="text-sm">備註：{order.note}</div>}
              <ul className="list-disc pl-6 mt-2 text-sm text-gray-700">
                {order.items.map((item, idx) => (
                  <li key={idx}>{item.name} × {item.quantity}（NT$ {item.price}）</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
