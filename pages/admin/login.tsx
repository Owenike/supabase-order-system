// pages/admin/login.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (loading) return
    setError('')
    setLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !data.session) {
      setError('帳號或密碼錯誤')
      setLoading(false)
      return
    }

    // 確認 email 是否已驗證（email_confirmed_at）
    // 使用 getUser 確保拿到完整 user 資訊
    const { data: uData, error: getUserErr } = await supabase.auth.getUser()
    const user = uData?.user
    if (getUserErr || !user) {
      setError('無法取得使用者資訊')
      setLoading(false)
      return
    }

    const emailConfirmed = (user as any).email_confirmed_at || (user as any).confirmed_at
    if (!emailConfirmed) {
      // 立即 sign out，並提示使用者先驗證 Email
      await supabase.auth.signOut()
      setError('請先完成 Email 驗證，系統已發送驗證信（或使用重新寄發驗證信）')
      setLoading(false)
      return
    }

    const role = (user as any).user_metadata?.role
    if (role !== 'admin') {
      setError('非管理員帳號')
      setLoading(false)
      return
    }

    router.push('/admin/dashboard')
  }

  return (
    <main className="bg-[#0B0B0B] min-h-screen flex items-center justify-center px-4">
      <style jsx global>{`
        .auth-card input {
          color: #fff !important;
          background-color: rgba(255, 255, 255, 0.08) !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff !important;
        }
        .auth-card ::placeholder {
          color: rgba(255, 255, 255, 0.5) !important;
        }
        .auth-card input:-webkit-autofill {
          -webkit-text-fill-color: #fff !important;
          box-shadow: 0 0 0px 1000px rgba(255, 255, 255, 0.08) inset !important;
          transition: background-color 5000s ease-in-out 0s !important;
        }
      `}</style>

      <div className="auth-card w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,.35)] p-6">
        <h1 className="text-2xl font-extrabold tracking-wide text-center mb-6">
          平台管理員登入
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <div className="text-sm text-center rounded-lg px-3 py-2 border text-red-200 bg-red-600/20 border-red-400/30">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-semibold shadow-[0_6px_20px_rgba(255,193,7,.25)] hover:bg-amber-500 hover:shadow-[0_8px_24px_rgba(255,193,7,.35)] focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </div>
      </div>
    </main>
  )
}
