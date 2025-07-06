import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import Image from 'next/image'

interface OrderItem {
  name: string
  quantity: number
}

interface Order {
  table_number: string
  spicy_level?: string
  items?: OrderItem[]
}

export default function StoreHomePage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [latestOrder, setLatestOrder] = useState<Order | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const storeId = localStorage.getItem('store_id')
    if (!storeId || !/^[0-9a-f-]{36}$/.test(storeId)) {
      localStorage.removeItem('store_id')
      router.push('/login')
      return
    }

    const fetchStoreInfo = async () => {
      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', storeId)
        .single()

      if (storeData?.name) {
        setStoreName(storeData.name)

        const { data: accountData } = await supabase
          .from('store_accounts')
          .select('id')
          .eq('store_name', storeData.name)
          .single()

        if (accountData?.id) {
          localStorage.setItem('store_account_id', accountData.id)
        }
      }
    }

    fetchStoreInfo()

    const channel = supabase
      .channel('order_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          setLatestOrder(payload.new as Order)
          audioRef.current?.play()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('store_id')
    localStorage.removeItem('store_account_id')
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-100 p-6">
      {/* ✅ 系統品牌 Logo（強制顯示） */}
      <Image
        src="/logo.png"
        alt="系統品牌 Logo"
        width={100}
        height={100}
        className="rounded-full border-2 border-red-500 mb-6 shadow-lg"
      />

      <h1 className="text-3xl font-bold mb-2 text-center text-black">
        歡迎進入店家後台
      </h1>
      <p className="mb-8 text-gray-600 text-lg">
        您的店家名稱：{storeName}
      </p>

      {latestOrder && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-300 rounded w-full max-w-md shadow">
          <p className="text-lg font-bold text-yellow-800">
            🔔 新訂單：桌號 {latestOrder.table_number}
          </p>
          {latestOrder.spicy_level && (
            <p className="text-sm text-red-700">辣度：{latestOrder.spicy_level}</p>
          )}
          <p className="text-sm text-gray-700">
            品項：
            {latestOrder.items?.map((item, index) => (
              <span key={index}>
                {item.name} x{item.quantity}&nbsp;
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 w-full max-w-md">
        <button
          onClick={() => router.push('/store/manage')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow hover:scale-105 transition"
        >
          🍱 分類與菜單管理
        </button>
        <button
          onClick={() => router.push('/store/orders')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow hover:scale-105 transition"
        >
          🧾 訂單管理
        </button>
        <button
          onClick={() => router.push('/store/stats')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow hover:scale-105 transition"
        >
          📊 銷售報表
        </button>
        <button
          onClick={() => router.push('/qrcode')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-gray-800 to-gray-600 text-white shadow hover:scale-105 transition"
        >
          📷 產生 QRCode
        </button>
        <button
          onClick={handleLogout}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gray-200 text-black hover:bg-gray-300 transition"
        >
          登出
        </button>
      </div>

      <audio ref={audioRef} src="/ding.mp3" preload="auto" />
    </div>
  )
}
