// components/layouts/StoreShell.tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { useGuardStoreAccount } from '@/lib/guards/useGuardStoreAccount'
import { formatROCRange } from '@/lib/date' // 民國年區間格式：formatROCRange(startISO, endISO)

type Lang = 'zh' | 'en'

const i18n = {
  zh: {
    brandSubtitle: '您的店家名稱：',
    langSwitch: 'EN',
    langSwitchEn: '中',
    logout: '登出',
    line: 'LINE',
    expired: '（試用已到期）',
  },
  en: {
    brandSubtitle: 'Your store name:',
    langSwitch: '中',
    langSwitchEn: 'EN',
    logout: 'Logout',
    line: 'LINE',
    expired: '(Trial expired)',
  },
} as const

// LINE 官方連結（可用環境變數覆蓋）
const LINE_URL = process.env.NEXT_PUBLIC_LINE_URL || 'https://lin.ee/m8vO3XI'

type AccountRow = {
  store_name: string | null
  trial_start_at: string | null
  trial_end_at: string | null
}

export default function StoreShell({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  // ✅ 用守門 hook：未登入/停用/到期會自動導回 /login；通過後提供 storeId
  const { guarding, storeId } = useGuardStoreAccount()

  const [lang, setLang] = useState<Lang>('zh')
  const t = i18n[lang]

  const [info, setInfo] = useState<AccountRow>({
    store_name: null,
    trial_start_at: null,
    trial_end_at: null,
  })
  const [trialRange, setTrialRange] = useState<string | null>(null)
  const [expired, setExpired] = useState<boolean>(false)

  // 統一從「store_accounts」讀取店名與期限（不要再從 stores 表讀）
  useEffect(() => {
    const run = async () => {
      if (!storeId || guarding) return
      const { data, error } = await supabase
        .from('store_accounts')
        .select('store_name, trial_start_at, trial_end_at')
        .eq('store_id', storeId)
        .maybeSingle()

      if (!error && data) {
        const next: AccountRow = {
          store_name: data.store_name ?? null,
          trial_start_at: data.trial_start_at ?? null,
          trial_end_at: data.trial_end_at ?? null,
        }
        setInfo(next)

        if (next.trial_start_at && next.trial_end_at) {
          setTrialRange(formatROCRange(next.trial_start_at, next.trial_end_at))
          // 到期日當天仍可用：用日期比較（把時間歸零）
          const end = new Date(next.trial_end_at)
          const today = new Date()
          end.setHours(0, 0, 0, 0)
          today.setHours(0, 0, 0, 0)
          setExpired(end < today)
        } else {
          setTrialRange(null)
          setExpired(false)
        }
      }
    }
    void run()
  }, [storeId, guarding])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    try {
      if (typeof window !== 'undefined') localStorage.clear()
    } catch {}
    // 用瀏覽器導頁，避免 router 沒注入時的問題
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  // 守門中先不渲染，避免閃爍
  if (guarding) return null

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white">
      {/* 頂部：左店名與期限徽章；右語系/LINE/登出 */}
      <header className="flex items-center justify-between px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-6xl mx-auto">
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
          <div className="flex flex-col">
            <div className="text-lg sm:text-xl md:text-2xl text-white/90 leading-tight flex items-center gap-2 flex-wrap">
              <span>
                {t.brandSubtitle}{' '}
                <span className="font-semibold text-white">
                  {info.store_name || '—'}
                </span>
              </span>

              {/* 期限徽章（從 store_accounts 來） */}
              {trialRange && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-amber-300/40 bg-amber-500/15 text-amber-200 text-xs sm:text-sm">
                  期限：{trialRange}
                </span>
              )}

              {/* 已到期提示（僅顯示文案；實際擋停用/到期由 hook 負責） */}
              {expired && (
                <span className="text-red-400 text-xs sm:text-sm">
                  {t.expired}
                </span>
              )}
            </div>
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

          {/* LINE 綠色按鈕 */}
          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 bg-[#06C755] text-white text-xs sm:text-sm font-medium shadow hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#06C755]/40"
            aria-label="前往 LINE"
            title="前往 LINE"
          >
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

      {/* 可選：置中頁面標題 */}
      {title ? (
        <section className="px-4 sm:px-6 md:px-10 pt-2 pb-4 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            {title}
          </h1>
        </section>
      ) : null}

      {/* 內容容器 */}
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
