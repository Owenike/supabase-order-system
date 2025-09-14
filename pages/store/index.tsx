'use client'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import Image from 'next/image'

interface Order {
  id: string
  created_at: string
  table_number: string
  items: { name: string; quantity: number; price: number }[]
  note?: string
}

const langMap = {
  zh: {
    pageTitle: '從新客到熟客，營收成長看得見',
    manageTitle: '分類與菜單管理',
    manageDesc:
      '在後台快速建立分類與餐點，支援多分店同步管理；消費者可透過 LINE/QR 連結下單。',
    ordersTitle: '訂單管理',
    ordersDesc:
      '整合訂單狀態、備註與通知，出餐流程更順、不漏單。',
    statsTitle: '銷售報表',
    statsDesc:
      '以日期與品項維度查看營收與熱門時段，協助你做分眾與再行銷決策。',
    qrcodeTitle: '產生 QRCode',
    qrcodeDesc:
      '一鍵產生桌號 / 外帶 QRCode，支援列印與下載。',
    brandSubtitle: '您的店家名稱：',
    langSwitch: 'EN',
    langSwitchEn: '中',
    logout: '登出',
    logoutMessage: '✅ 已成功登出',
    newOrder: '🛎️ 新訂單來囉！',
    inactive: '此帳號已被停用，請聯繫管理員',
  },
  en: {
    pageTitle: 'From New to Loyal Customers — Omnichannel Membership Ops',
    manageTitle: 'E-Membership / Menu Management',
    manageDesc:
      'Build categories & items fast. Multi-store sync. Customers order via LINE/QR and check points.',
    ordersTitle: 'Auto Data Collection / Orders',
    ordersDesc:
      'Manage statuses & notes with alerts. Capture customer data to power remarketing.',
    statsTitle: 'Segmentation & Remarketing / Sales',
    statsDesc:
      'Analyze revenue by date & item. Find peak hours to guide segmentation and campaigns.',
    qrcodeTitle: 'Tiered Membership / QR Codes',
    qrcodeDesc:
      'Generate table/takeout QR codes in one click. Print or download for tiered offers.',
    brandSubtitle: 'Your store name:',
    langSwitch: '中',
    langSwitchEn: 'EN',
    logout: 'Logout',
    logoutMessage: '✅ Logged out successfully',
    newOrder: '🛎️ New Order Received!',
    inactive: 'This account has been deactivated. Please contact admin.',
  },
} as const

type Lang = keyof typeof langMap

export default function StoreHomePage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [, setLatestOrder] = useState<Order | null>(null)
  const [lang, setLang] = useState<Lang>('zh')
  const [showAlert, setShowAlert] = useState(false)
  const [loading, setLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement>(null)

  const t = langMap[lang]

  useEffect(() => {
    const init = async () => {
      // 1) Auth 檢查
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session || !session.user) {
        router.replace('/login')
        return
      }

      // 2) store_id 檢查
      const storeId = localStorage.getItem('store_id')
      if (!storeId || !/^[0-9a-f-]{36}$/.test(storeId)) {
        localStorage.clear()
        router.replace('/login')
        return
      }

      // 3) 店家名稱
      const { data: storeData, error: storeErr } = await supabase
        .from('stores')
        .select('name')
        .eq('id', storeId)
        .maybeSingle()

      if (storeErr || !storeData?.name) {
        localStorage.clear()
        router.replace('/login')
        return
      }
      setStoreName(storeData.name)

      // 4) 帳號啟用
      const { data: accountData, error: accountErr } = await supabase
        .from('store_accounts')
        .select('id, is_active')
        .eq('store_id', storeId)
        .maybeSingle()

      if (accountErr || !accountData?.id) {
        localStorage.clear()
        router.replace('/login')
        return
      }
      if (!accountData.is_active) {
        alert(t.inactive)
        await supabase.auth.signOut()
        localStorage.clear()
        router.replace('/login')
        return
      }

      localStorage.setItem('store_account_id', accountData.id)
      setLoading(false)

      // 5) 新訂單通知
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
            setShowAlert(true)
            setTimeout(() => setShowAlert(false), 3000)
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    init()
  }, [router, t.inactive])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    alert(t.logoutMessage)
    router.push('/login')
  }

  const go = (path: string) => {
    router.push(path)
  }

  const Card = ({
    icon,
    title,
    desc,
    onClick,
    ariaLabel,
  }: {
    icon: ReactNode
    title: string
    desc: string
    onClick: () => void
    ariaLabel: string
  }) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' ? onClick() : null)}
      className="
        group rounded-2xl bg-[#2B2B2B] border border-white/10
        p-6 sm:p-7 md:p-8
        hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30
        transition duration-200 cursor-pointer
        flex flex-col
      "
    >
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md">
        {icon}
      </div>
      <h3 className="text-white text-2xl font-extrabold tracking-tight mb-3">
        {title}
      </h3>
      <p className="text-gray-300 leading-relaxed text-sm sm:text-base">
        {desc}
      </p>
    </div>
  )

  if (loading) return null

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ==== 頂部導覽：左上角 LOGO、右上角語言與登出（放大版） ==== */}
      <header className="flex items-center justify-between px-4 sm:px-6 md:px-10 py-6 md:py-8">
        <div className="flex items-center gap-4 sm:gap-5">
          {/* LOGO 放大：手機 56、平板 64、桌機 80 */}
          <Image
            src="/logo.png"
            alt="品牌 Logo"
            width={80}
            height={80}
            className="rounded-full w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shadow-lg"
            priority
          />
          {/* 文字放大：手機 lg、平板 xl、桌機 2xl；不再 hidden */}
          <div className="text-lg sm:text-xl md:text-2xl text-white/90 leading-tight">
            {t.brandSubtitle}{' '}
            <span className="font-semibold text-white">{storeName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="text-xs sm:text-sm text-white/80 border border-white/20 px-3 py-1.5 rounded-md hover:bg-white/10"
          >
            {lang === 'zh' ? t.langSwitch : t.langSwitchEn}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs sm:text-sm text-white/90 border border-white/20 px-3 py-1.5 rounded-md hover:bg-white/10"
          >
            {t.logout}
          </button>
        </div>
      </header>

      {/* 新訂單提醒 */}
      {showAlert && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg animate-pulse z-50">
          {t.newOrder}
        </div>
      )}

      {/* ==== 主視覺：置中大標 ==== */}
      <section className="px-4 sm:px-6 md:px-10 pt-4 pb-6 text-center">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
          {t.pageTitle}
        </h1>
      </section>

      {/* ==== 內容卡片（2×2） ==== */}
      <main className="px-4 sm:px-6 md:px-10 pb-16">
        <div className="grid gap-6 sm:gap-7 md:gap-8 grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto">
          {/* 1. 分類與菜單管理 → /store/manage-menus */}
          <Card
            ariaLabel="manage-menus"
            onClick={() => go('/store/manage-menus')}
            title={t.manageTitle}
            desc={t.manageDesc}
            icon={
              <svg
                viewBox="0 0 24 24"
                className="h-12 w-12 text-yellow-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M7 9h10M7 13h6" />
              </svg>
            }
          />

          {/* 2. 訂單管理 → /store/orders */}
          <Card
            ariaLabel="orders"
            onClick={() => go('/store/orders')}
            title={t.ordersTitle}
            desc={t.ordersDesc}
            icon={
              <svg
                viewBox="0 0 24 24"
                className="h-12 w-12 text-yellow-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 7h16M4 12h16M4 17h10" />
                <circle cx="18" cy="17" r="0.8" fill="currentColor" />
              </svg>
            }
          />

          {/* 3. 銷售報表 → /store/stats */}
          <Card
            ariaLabel="stats"
            onClick={() => go('/store/stats')}
            title={t.statsTitle}
            desc={t.statsDesc}
            icon={
              <svg
                viewBox="0 0 24 24"
                className="h-12 w-12 text-yellow-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 19V5M8 19v-6M12 19v-9M16 19V8M20 19V4" />
              </svg>
            }
          />

          {/* 4. 產生 QRCode → /qrcode */}
          <Card
            ariaLabel="qrcode"
            onClick={() => go('/qrcode')}
            title={t.qrcodeTitle}
            desc={t.qrcodeDesc}
            icon={
              <svg
                viewBox="0 0 24 24"
                className="h-12 w-12 text-yellow-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <path d="M14 14h3v3M17 17h4M21 14v7" />
              </svg>
            }
          />
        </div>
      </main>

      <audio ref={audioRef} src="/ding.mp3" preload="auto" />
    </div>
  )
}
