// pages/auth/callback.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [msg, setMsg] = useState('驗證中，請稍候…')

  useEffect(() => {
    // Supabase client 已啟用 detectSessionInUrl:true，
    // 只要這個頁面被開啟，SDK 會自動從 URL 取 token 並完成 session 建立。
    // 我們這裡只根據 URL Hash 是否帶錯誤來顯示文字，然後導向登入頁。
    const hash = typeof window !== 'undefined' ? window.location.hash : ''

    if (hash.includes('error') || hash.includes('error_description')) {
      setStatus('error')
      setMsg('驗證連結無效或已過期，請回到註冊頁重新請求驗證信。')
      return
    }

    setStatus('ok')
    setMsg('Email 驗證成功！將為你跳轉至登入頁…')

    const t = setTimeout(() => {
      router.replace('/login')
    }, 2000)

    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] text-white">
      <div className={`rounded-lg border px-5 py-4 ${
        status === 'ok' ? 'border-emerald-400/30 bg-emerald-500/10' :
        status === 'error' ? 'border-red-400/30 bg-red-500/10' :
        'border-white/10 bg-white/5'
      }`}>
        {msg}
      </div>
    </div>
  )
}
