// pages/store/index.tsx
'use client'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import StoreShell from '../../components/layouts/StoreShell'

interface Order {
  id: string
  created_at: string
  table_number: string
  items: { name: string; quantity: number; price: number }[]
  note?: string
}

interface StoreRow {
  name: string | null
  license_start_at: string | null
  license_end_at: string | null
}

const langMap = {
  zh: {
    pageTitle: '從新客到熟客，營收成長看得見',
    manageTitle: '分類與菜單管理',
    manageDesc:
      '在後台快速建立分類與餐點，支援多分店同步管理；消費者可透過 LINE/QR 連結下單。',
    ordersTitle: '訂單管理',
    ordersDesc: '整合訂單狀態、備註與通知，出餐流程更順、不漏單。',
    statsTitle: '銷售報表',
    statsDesc:
      '以日期與品項維度查看營收與熱門時段，協助你做分眾與再行銷決策。',
    qrcodeTitle: '產生 QRCode',
    qrcodeDesc: '一鍵產生桌號 / 外帶 QRCode，支援PDF下載。',
    logoutMessage: '✅ 已成功登出',
    newOrder: '🛎️ 新訂單來囉！',
    inactive: '此帳號已被停用，請聯繫管理員',
    storeNamePrefix: '您的店家名稱：',
    periodPrefix: '期限：',
    loadError:
      '讀取店家資料失敗。請稍後再試或聯繫管理員（F12 查看詳細錯誤）。',
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
    logoutMessage: '✅ Logged out successfully',
    newOrder: '🛎️ New Order Received!',
    inactive: 'This account has been deactivated. Please contact admin.',
    storeNamePrefix: 'Store Name: ',
    periodPrefix: 'Period: ',
    loadError:
      'Failed to load store data. Please try again or contact admin (open DevTools for details).',
  },
} as const

type Lang = keyof typeof langMap

export default function StoreHomePage() {
  const router = useRouter()
  const [, setLatestOrder] = useState<Order | null>(null)
  const [lang] = useState<Lang>('zh') // 首頁文案使用本地狀態；Header 語系由 StoreShell 控制
  const [showAlert, setShowAlert] = useState(false)
  const [loading, setLoading] = useState(true)
  const [storeInfo, setStoreInfo] = useState<StoreRow | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const t = langMap[lang]

  const toMinguo = (iso: string | null) => {
    if (!iso) return '-'
    const d = new Date(iso)
    const y = d.getFullYear() - 1911
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}/${mm}/${dd}`
  }

  useEffect(() => {
    const init = async () => {
      try {
        // 1) Auth 檢查
        const {
          data: { session },
          error: sErr,
        } = await supabase.auth.getSession()
        if (sErr) {
          console.error('[auth.getSession] error:', sErr)
        }
        if (!session || !session.user) {
          router.replace('/login')
          return
        }

        // 2) store_id 檢查
        const storeId = localStorage.getItem('store_id')
        if (!storeId || !/^[0-9a-f-]{36}$/.test(storeId)) {
          console.warn('[store] invalid or empty store_id in localStorage:', storeId)
          localStorage.clear()
          router.replace('/login')
          return
        }

        // 3) 帳號啟用檢查
        const { data: accountRows, error: accErr } = await supabase
          .from('store_accounts')
          .select('id, is_active')
          .eq('store_id', storeId)
          .limit(1)

        if (accErr) {
          console.error('[store_accounts] select error:', accErr)
          setErrorMsg(t.loadError)
          setLoading(false)
          return
        }

        if (!accountRows || accountRows.length === 0) {
          console.warn('[store_accounts] no rows for store_id:', storeId)
          localStorage.clear()
          router.replace('/login')
          return
        }

        const account = accountRows[0]
        if (!account.is_active) {
          alert(t.inactive)
          await supabase.auth.signOut()
          localStorage.clear()
          router.replace('/login')
          return
        }
        localStorage.setItem('store_account_id', account.id)

        // 4) 讀取 stores（單一真實來源）
        const { data: s, error: sErr2, status } = await supabase
          .from('stores')
          .select('name, license_start_at, license_end_at')
          .eq('id', storeId)
          .single()

        if (sErr2) {
          console.error(`[stores] select error (status ${status}):`, sErr2)
          setErrorMsg(t.loadError)
          setLoading(false)
          return
        }

        setStoreInfo(s as StoreRow)
        setLoading(false)

        // 5) 新訂單通知（Realtime）
        const orderChannel = supabase
          .channel(`order_notifications_${storeId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
            (payload) => {
              setLatestOrder(payload.new as Order)
              audioRef.current?.play()
              setShowAlert(true)
              setTimeout(() => setShowAlert(false), 3000)
            }
          )
          .subscribe()

        // 6) stores 即時更新
        const storeChannel = supabase
          .channel(`stores_watch_${storeId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` },
            async () => {
              const { data: s2, error: s2Err } = await supabase
                .from('stores')
                .select('name, license_start_at, license_end_at')
                .eq('id', storeId)
                .single()
              if (s2Err) {
                console.error('[stores] realtime refresh error:', s2Err)
              } else {
                setStoreInfo(s2 as StoreRow)
              }
            }
          )
          .subscribe()

        return () => {
          supabase.removeChannel(orderChannel)
          supabase.removeChannel(storeChannel)
        }
      } catch (e) {
        console.error('[store init] unexpected error:', e)
        setErrorMsg(t.loadError)
        setLoading(false)
      }
    }

    void init()
  }, [router, t.inactive, t.loadError])

  const go = (path: string) => router.push(path)

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
    <StoreShell title={t.pageTitle}>
      {/* 若讀取 stores 失敗，顯示錯誤訊息（避免直接踢回登入看不到原因） */}
      {errorMsg && (
        <div className="mx-4 sm:mx-6 md:mx-10 mt-4 rounded-md bg-red-600/20 border border-red-500/50 text-red-200 px-4 py-3">
          {errorMsg}
        </div>
      )}

      {/* 頂部：店名 + 期限（民國年） */}
      <div className="px-4 sm:px-6 md:px-10 pt-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/90">
          <span className="inline-flex items-center gap-2">
            <span className="opacity-80">{langMap[lang].storeNamePrefix}</span>
            <span className="font-semibold">{storeInfo?.name ?? '-'}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="opacity-80">{langMap[lang].periodPrefix}</span>
            <span className="rounded-md bg-yellow-500/20 text-yellow-300 px-2 py-0.5">
              {toMinguo(storeInfo?.license_start_at ?? null)} ～ {toMinguo(storeInfo?.license_end_at ?? null)}
            </span>
          </span>
        </div>
      </div>

      {/* 新訂單提醒 */}
      {showAlert && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg animate-pulse z-50">
          {langMap[lang].newOrder}
        </div>
      )}

      {/* 內容卡片（2×2） */}
      <main className="px-4 sm:px-6 md:px-10 pb-16">
        <div className="grid gap-6 sm:gap-7 md:gap-8 grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto">
          <Card
            ariaLabel="manage-menus"
            onClick={() => go('/store/manage-menus')}
            title={langMap[lang].manageTitle}
            desc={langMap[lang].manageDesc}
            icon={
              <svg viewBox="0 0 24 24" className="h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M7 9h10M7 13h6" />
              </svg>
            }
          />

          <Card
            ariaLabel="orders"
            onClick={() => go('/store/orders')}
            title={langMap[lang].ordersTitle}
            desc={langMap[lang].ordersDesc}
            icon={
              <svg viewBox="0 0 24 24" className="h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 7h16M4 12h16M4 17h10" />
                <circle cx="18" cy="17" r="0.8" fill="currentColor" />
              </svg>
            }
          />

          <Card
            ariaLabel="stats"
            onClick={() => go('/store/stats')}
            title={langMap[lang].statsTitle}
            desc={langMap[lang].statsDesc}
            icon={
              <svg viewBox="0 0 24 24" className="h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 19V5M8 19v-6M12 19v-9M16 19V8M20 19V4" />
              </svg>
            }
          />

          <Card
            ariaLabel="qrcode"
            onClick={() => go('/qrcode')}
            title={langMap[lang].qrcodeTitle}
            desc={langMap[lang].qrcodeDesc}
            icon={
              <svg viewBox="0 0 24 24" className="h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="1.5">
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
    </StoreShell>
  )
}
