'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/router'
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
  },
  en: {
    brandSubtitle: 'Your store name:',
    langSwitch: '中',
    langSwitchEn: 'EN',
    logout: 'Logout',
    inactive: 'This account has been deactivated. Please contact admin.',
  },
} as const

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
    const init = async () => {
      // 1) Auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        router.replace('/login')
        return
      }
      // 2) store_id
      const storeId = typeof window !== 'undefined' ? localStorage.getItem('store_id') : null
      if (!storeId || !/^[0-9a-f-]{36}$/.test(storeId)) {
        localStorage.clear()
        router.replace('/login')
        return
      }
      // 3) 店名
      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', storeId)
        .maybeSingle()
      setStoreName(storeData?.name || '')

      // 4) 帳號啟用
      const { data: accountData } = await supabase
        .from('store_accounts')
        .select('id, is_active')
        .eq('store_id', storeId)
        .maybeSingle()

      if (!accountData?.id) {
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
      setBooted(true)
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    router.push('/login')
  }

  if (!booted) return null

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 頂部：放大 LOGO＋店名、右上語言/登出 */}
      <header className="flex items-center justify-between px-4 sm:px-6 md:px-10 py-6 md:py-8">
        <div className="flex items-center gap-4 sm:gap-5">
          <Image
            src="/logo.png"
            alt="品牌 Logo"
            width={80}
            height={80}
            className="rounded-full w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shadow-lg"
            priority
          />
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

      {/* 可選：頁面標題（由 _app 傳入） */}
      {title ? (
        <section className="px-4 sm:px-6 md:px-10 pt-2 pb-4 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            {title}
          </h1>
        </section>
      ) : null}

      {/* 內容容器（與首頁一致的左右內距/下方留白） */}
      <main className="px-4 sm:px-6 md:px-10 pb-16">{children}</main>
    </div>
  )
}
