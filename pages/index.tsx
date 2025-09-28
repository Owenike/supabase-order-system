'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router' // ⚠️ 如果專案是 Next.js App Router 要改用 next/navigation
import { supabase } from '@/lib/supabaseClient'
import Image from 'next/image'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'

interface OrderItem {
  name: string
  quantity: number
}

interface Order {
  id: string
  created_at: string
  store_id: string
  table_number: string
  spicy_level?: string
  items?: OrderItem[]
}

export default function StoreHomePage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [latestOrder, setLatestOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  // 檢查 reset token，若存在自動導向重設密碼頁
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('access_token') && hash.includes('type=recovery')) {
      const query = new URLSearchParams(hash.slice(1))
      const token = query.get('access_token')
      if (token) {
        localStorage.setItem('access_token', token)
        router.push('/reset-password')
      }
    }
  }, [router])

  const fetchStoreInfo = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session || !session.user) {
      setError('尚未登入')
      router.replace('/login')
      return
    }

    const storeId = localStorage.getItem('store_id')
    if (!storeId || !/^[0-9a-f-]{36}$/.test(storeId)) {
      setError('store_id 格式錯誤')
      localStorage.removeItem('store_id')
      localStorage.removeItem('store_account_id')
      router.replace('/login')
      return
    }

    const { data: storeData, error: storeErr } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .single()

    if (!storeData?.name || storeErr) {
      setError('找不到對應的店家資料')
      localStorage.removeItem('store_id')
      localStorage.removeItem('store_account_id')
      router.replace('/login')
      return
    }

    setStoreName(storeData.name)

    // ✅ 改用 store_id 查詢，避免用 name 對應
    const { data: accountData, error: accountErr } = await supabase
      .from('store_accounts')
      .select('id')
      .eq('store_id', storeId)
      .single()

    if (!accountData?.id || accountErr) {
      setError('找不到帳號')
      localStorage.removeItem('store_id')
      localStorage.removeItem('store_account_id')
      router.replace('/login')
      return
    }

    localStorage.setItem('store_account_id', accountData.id)
    setLoading(false)
  }, [router])

  useEffect(() => {
    void fetchStoreInfo()
  }, [fetchStoreInfo])

  useEffect(() => {
    const storeId = localStorage.getItem('store_id')
    if (!storeId) return

    const channel = supabase
      .channel('order_notifications')
      .on(
        'postgres_changes' as const,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        (payload: RealtimePostgresInsertPayload<Order>) => {
          setLatestOrder(payload.new)
          audioRef.current?.play().catch(() => {
            // 忽略瀏覽器自動播放限制錯誤
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('store_id')
    localStorage.removeItem('store_account_id')
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">{error ? `⚠️ ${error}` : '載入中...'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-100 p-6">
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
      <p className="mb-8 text-gray-600 text-lg">您的店家名稱：{storeName}</p>

      {latestOrder && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-300 rounded w-full max-w-md shadow">
          <p className="text-lg font-bold text-yellow-800">
            🔔 新訂單：桌號 {latestOrder.table_number}
          </p>
          {latestOrder.spicy_level && (
            <p className="text-sm text-red-700">
              辣度：{latestOrder.spicy_level}
            </p>
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
