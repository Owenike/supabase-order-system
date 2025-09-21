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

    try {
      const cleanedEmail = email.trim().toLowerCase()
      if (!cleanedEmail || !password) {
        setError('請輸入 Email 與密碼')
        setLoading(false)
        return
      }

      // 1) Supabase Auth 登入
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      })

      if (signInError || !data?.session) {
        setError('帳號或密碼錯誤')
        setLoading(false)
        return
      }

      // 2) 取得最新使用者資訊，確認是否已驗證
      const { data: uData, error: getUserErr } = await supabase.auth.getUser()
      const user = uData?.user
      if (getUserErr || !user) {
        setError('無法取得使用者資訊')
        setLoading(false)
        return
      }

      const emailConfirmed =
        (user as any).email_confirmed_at ||
        (user as any).confirmed_at ||
        user.email_confirmed_at

      if (!emailConfirmed) {
        // 若未驗證，登出並提示
        await supabase.auth.signOut().catch(() => void 0)
        setError('請先完成 Email 驗證，再以管理員身份登入')
        setLoading(false)
        return
      }

      // 3) 管理員判定（多來源：user_metadata / app_metadata / 可選資料表）
      const metaRole: string | undefined = (user as any)?.user_metadata?.role
      const appRoles: string[] | undefined = (user as any)?.app_metadata?.roles

      let isAdmin =
        metaRole === 'admin' ||
        (Array.isArray(appRoles) && appRoles.includes('admin'))

      // 3-1) 可選：若你有建立 platform_admins 表（欄位 email），再用資料表雙保險
      if (!isAdmin) {
        try {
          const { data: checkRow, error: chkErr } = await supabase
            .from('platform_admins')
            .select('email')
            .eq('email', cleanedEmail)
            .limit(1)
            .maybeSingle()
          if (!chkErr && checkRow?.email) isAdmin = true
        } catch {
          // 沒有這張表或權限不足就忽略，不阻斷登入流程
        }
      }

      if (!isAdmin) {
        await supabase.auth.signOut().catch(() => void 0)
        setError('非管理員帳號')
        setLoading(false)
        return
      }

      // 4) 通過 → 導向管理後台
      router.push('/admin/dashboard')
    } catch (e) {
      console.error('admin login error:', e)
      setError('發生未知錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
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
            autoComplete="username"
          />
          <input
            type="password"
            className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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

          {/* 忘記密碼（可選，之後補 /admin/forgot-password 頁） */}
          <div className="text-center">
            <a href="/admin/forgot-password" className="text-sm text-gray-400 hover:text-white">
              忘記密碼？
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
