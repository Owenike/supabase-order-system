import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

const langMap = {
  zh: {
    title: '歡迎進入店家後台',
    subtitle: '您的店家名稱：',
    manage: '分類與菜單管理',
    orders: '訂單管理',
    stats: '銷售報表',
    qrcode: '產生 QRCode',
    logout: '登出',
    logoutMessage: '✅ 已成功登出',
    newOrder: '🛎️ 新訂單來囉！',
  },
  en: {
    title: 'Welcome to the Store Backend',
    subtitle: 'Your store name:',
    manage: 'Manage Menu',
    orders: 'Orders',
    stats: 'Sales Report',
    qrcode: 'Generate QRCode',
    logout: 'Logout',
    logoutMessage: '✅ Logged out successfully',
    newOrder: '🛎️ New Order Received!',
  },
}

export default function StoreHomePage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [latestOrder, setLatestOrder] = useState<any>(null)
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [showAlert, setShowAlert] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const t = langMap[lang]

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
          setLatestOrder(payload.new)
          audioRef.current?.play()
          setShowAlert(true)
          setTimeout(() => setShowAlert(false), 3000)
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
    alert(t.logoutMessage)
    router.push('/login')
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-100 p-6 px-4 sm:px-6 pb-24">
      {/* 語言切換按鈕 */}
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        className="absolute top-4 right-4 text-sm text-gray-500 border px-2 py-1 rounded hover:bg-gray-100"
      >
        {lang === 'zh' ? 'EN' : '中'}
      </button>

      {/* 視覺新訂單提示 */}
      {showAlert && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg animate-pulse z-50">
          {t.newOrder}
        </div>
      )}

      {/* LOGO with animation */}
      <img
        src="/logo.png"
        alt="系統品牌 Logo"
        width={100}
        height={100}
        className="animate-float"
        style={{
          borderRadius: '9999px',
          marginBottom: '24px',
          backgroundColor: 'white',
          padding: '8px',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
        }}
      />

      <h1 className="text-3xl font-bold mb-1 text-center text-black tracking-wide">
        {t.title}
      </h1>
      <p className="mb-8 text-gray-500 text-base tracking-tight">
        {t.subtitle} {storeName}
      </p>

      <div className="flex flex-col gap-4 w-full max-w-md px-6 sm:px-8 md:px-10">
        <button
          onClick={() => router.push('/store/manage')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-orange-400 to-yellow-400 text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          🍱 {t.manage}
        </button>
        <button
          onClick={() => router.push('/store/orders')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-green-500 to-teal-400 text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          🧾 {t.orders}
        </button>
        <button
          onClick={() => router.push('/store/stats')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-violet-500 to-pink-400 text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          📊 {t.stats}
        </button>
        <button
          onClick={() => router.push('/qrcode')}
          className="w-full py-5 text-lg font-bold rounded-xl bg-gradient-to-r from-gray-800 to-gray-600 text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          📷 {t.qrcode}
        </button>
        <button
          onClick={handleLogout}
          className="w-full py-5 text-lg font-bold rounded-xl border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-none hover:scale-105 active:scale-95 transition-transform"
        >
          {t.logout}
        </button>
      </div>

      <audio ref={audioRef} src="/ding.mp3" preload="auto" />

      {/* 波浪背景（自然曲線） */}
      <div className="absolute -bottom-4 left-0 w-full overflow-hidden leading-none pointer-events-none">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-24">
          <path
            d="M0,40 C300,80 900,0 1200,60 L1200,120 L0,120 Z"
            fill="url(#brand-gradient)"
          />
          <defs>
            <linearGradient id="brand-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  )
}
