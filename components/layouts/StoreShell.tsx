// components/Layout/StoreShell.tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Lang = 'zh' | 'en'

const i18n = {
  zh: {
    brandSubtitle: '您的店家名稱：',
    langSwitch: 'EN',
    langSwitchEn: '中',
    logout: '登出',
    inactive: '此帳號已被停用，請聯繫管理員',
    line: 'LINE',
  },
  en: {
    brandSubtitle: 'Your store name:',
    langSwitch: '中',
    langSwitchEn: 'EN',
    logout: 'Logout',
    inactive: 'This account has been deactivated. Please contact admin.',
    line: 'LINE',
  },
} as const

// ✅ /store 底下「不需登入即可存取」的路徑白名單
const PUBLIC_STORE_PATHS = new Set<string>([
  '/store/forgot-password',
  '/store/reset-password',
  '/store/login',
])

function isPublicStoreAuthPath(path: string): boolean {
  // 允許子路徑與查詢字串，例如 /store/reset-password?access_token=...
  for (const p of PUBLIC_STORE_PATHS) {
    if (path.startsWith(p)) return true
  }
  return false
}

// ✅ LINE 連結（可用環境變數覆蓋）
const LINE_URL =
  process.env.NEXT_PUBLIC_LINE_URL ||
  'https://lin.ee/m8vO3XI' // ← 改成你的官方 LINE 連結（lin.ee 或 @ID 都可）

export default function StoreShell({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [lang, setLang] = useState<Lang>('zh')
  const t = i18n[lang]
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const currentPath = router.asPath || router.pathname

      // ✅ 白名單頁面：直接放行，不做任何登入/店家檢查
      if (isPublicStoreAuthPath(currentPath)) {
        if (!cancelled) setBooted(true)
        return
      }

      // 其餘 /store/* 需登入
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session || !session.user) {
        if (!cancelled) {
          const next = encodeURIComponent(currentPath)
          router.replace(`/login?next=${next}`)
        }
        return
      }

      const storeId =
        typeof window !== 'undefined' ? localStorage.getItem('store_id') : null
      if (!storeId || !/^[0-9a-f-]{36}$/.test(storeId)) {
        try {
          if (typeof window !== 'undefined') localStorage.clear()
        } catch {}
        if (!cancelled) router.replace('/login')
        return
      }

      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', storeId)
        .maybeSingle()
      if (!cancelled) setStoreName(storeData?.name || '')

      const { data: accountData } = await supabase
        .from('store_accounts')
        .select('id, is_active')
        .eq('store_id', storeId)
        .maybeSingle()

      if (!accountData?.id) {
        try {
          if (typeof window !== 'undefined') localStorage.clear()
        } catch {}
        if (!cancelled) router.replace('/login')
        return
      }
      if (!accountData.is_active) {
        alert(t.inactive)
        await supabase.auth.signOut()
        try {
          if (typeof window !== 'undefined') localStorage.clear()
        } catch {}
        if (!cancelled) router.replace('/login')
        return
      }

      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('store_account_id', accountData.id)
        }
      } catch {}

      if (!cancelled) setBooted(true)
    }

    void init()

    return () => {
      cancelled = true
    }
    // 以路由變化為觸發；避免 t/lang 變動觸發重新導轉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.asPath, router.pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    try {
      if (typeof window !== 'undefined') localStorage.clear()
    } catch {}
    router.push('/login')
  }

  if (!booted) return null

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 頂部：左上 LOGO/店名（可點回 /store），右上語言/LINE/登出 */}
      <header className="flex items-center justify-between px-4 sm:px-6 md:px-10 py-6 md:py-8">
        <Link
          href="/store"
          className="flex items-center gap-4 sm:gap-5 group"
          aria-label="返回店家首頁"
          title="返回店家首頁"
        >
          <Image
            src="/logo.png"
            alt="品牌 Logo"
            width={80}
            height={80}
            className="rounded-full w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shadow-lg transition-transform group-hover:scale-[1.03]"
            priority
          />
          <div className="text-lg sm:text-xl md:text-2xl text-white/90 leading-tight">
            {t.brandSubtitle}{' '}
            <span className="font-semibold text-white">{storeName}</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {/* 語言切換 */}
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="text-xs sm:text-sm text-white/80 border border-white/20 px-3 py-1.5 rounded-md hover:bg-white/10"
          >
            {lang === 'zh' ? t.langSwitch : t.langSwitchEn}
          </button>

          {/* ✅ LINE 綠色按鈕 */}
          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 bg-[#06C755] text-white text-xs sm:text-sm font-medium shadow hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#06C755]/40"
            aria-label="前往 LINE"
            title="前往 LINE"
          >
            {/* 內建 SVG（避免額外資產） */}
            <svg viewBox="0 0 36 36" width="16" height="16" aria-hidden className="opacity-90">
              <path
                d="M18 4C9.716 4 3 9.838 3 16.94c0 4.1 2.17 7.73 5.56 10.09l-.36 3.98c-.05.55.53.94 1 .68l4.51-2.36c1.28.29 2.64.45 4.05.45 8.284 0 15-5.838 15-12.94S26.284 4 18 4z"
                fill="currentColor"
              />
              <path
                d="M11 14.5h2v7h-2v-7zm4.2 0h2v7h-2v-7zm4.2 0H21v5.1l3-5.1h2v7h-2v-5.1l-3 5.1h-1.6v-7z"
                fill="#fff"
              />
            </svg>
            {t.line}
          </a>

          {/* 登出 */}
          <button
            onClick={handleLogout}
            className="text-xs sm:text-sm text-white/90 border border-white/20 px-3 py-1.5 rounded-md hover:bg-white/10"
          >
            {t.logout}
          </button>
        </div>
      </header>

      {/* 可選：頁面標題 */}
      {title ? (
        <section className="px-4 sm:px-6 md:px-10 pt-2 pb-4 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            {title}
          </h1>
        </section>
      ) : null}

      {/* 內容容器：預設白字；同時針對「白底元件」自動把文字改為深色 */}
      <main
        className="
          px-4 sm:px-6 md:px-10 pb-16
          [&_.surface]:text-gray-900
          [&_.card]:text-gray-900
          [&_.panel]:text-gray-900
          [&_.prose]:text-gray-900
          [&_.bg-white]:text-gray-900
          [&_.bg-gray-50]:text-gray-900
          [&_.bg-gray-100]:text-gray-900
          [&_input]:text-gray-900 [&_input::placeholder]:text-gray-400
          [&_textarea]:text-gray-900 [&_textarea::placeholder]:text-gray-400
          [&_select]:text-gray-900 [&_option]:text-gray-900
          [&_thead]:text-gray-900
        "
      >
        {children}
      </main>
    </div>
  )
}
