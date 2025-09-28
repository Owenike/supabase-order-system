// /pages/login.tsx
'use client'

import { useState, type FormEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

function isExpired(endISO: string | null): boolean {
  if (!endISO) return false
  const end = new Date(endISO)
  if (Number.isNaN(end.getTime())) return false
  const today = new Date()
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return end < today
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (): Promise<void> => {
    if (loading) return
    setMsg('')
    setLoading(true)

    try {
      // 清掉舊的本機識別
      try {
        localStorage.removeItem('store_id')
        localStorage.removeItem('store_account_id')
      } catch {}

      const cleanedEmail = email.trim().toLowerCase()

      // 1) Supabase Auth 登入
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      })
      if (loginError || !data?.user) {
        setMsg(loginError?.message || '登入失敗，請確認帳號與密碼')
        return
      }

      // 2) 驗證 Email 是否完成
      if (!data.user.email_confirmed_at) {
        setMsg('此帳號尚未完成 Email 驗證，請先到信箱點擊驗證連結')
        return
      }

      // 3) 用 email 從「store_accounts」找對應門市（✅ 正確的表）
      const { data: accountRow, error: accErr } = await supabase
        .from('store_accounts')
        .select('id, store_id, is_active, trial_end_at')
        .eq('email', cleanedEmail)
        .maybeSingle()

      if (accErr || !accountRow?.store_id) {
        setMsg('此帳號尚未綁定店家或帳號不存在')
        return
      }

      // 4) 狀態與期限檢查
      if (!accountRow.is_active) {
        setMsg('此帳號已被停用，請聯繫管理員')
        return
      }
      if (isExpired(accountRow.trial_end_at as string | null)) {
        setMsg('此帳號使用期限已到期，請聯繫管理員延長期限')
        return
      }

      // 5) 寫入 localStorage
      try {
        localStorage.setItem('store_id', accountRow.store_id)
        localStorage.setItem('store_account_id', accountRow.id)
      } catch {}

      setMsg('✅ 登入成功，正在導向後台…')
      setTimeout(() => {
        router.replace('/store')
      }, 250)
    } catch (err) {
      console.error('💥 登入流程錯誤:', err)
      setMsg('發生未知錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void handleLogin()
  }

  return (
    <main className="bg-[#0B0B0B] min-h-screen flex items-center justify-center px-4">
      {/* Autofill 修正樣式 */}
      <style jsx global>{`
        .auth-card input,
        .auth-card textarea,
        .auth-card select,
        .auth-card option {
          color: #fff !important;
          background-color: rgba(255, 255, 255, 0.06) !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff !important;
        }
        .auth-card ::placeholder {
          color: rgba(255, 255, 255, 0.5) !important;
        }
        .auth-card input:-webkit-autofill {
          -webkit-text-fill-color: #fff !important;
          box-shadow: 0 0 0px 1000px rgba(255, 255, 255, 0.06) inset !important;
          transition: background-color 5000s ease-in-out 0s !important;
          caret-color: #fff !important;
        }
      `}</style>

      <div className="auth-card w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,.35)] p-6">
        <div className="flex flex-col items-center gap-4 mb-6">
          <Image
            src="/login-logo.png"
            alt="品牌 Logo"
            width={240}
            height={96}
            priority
            className="h-auto w-auto select-none pointer-events-none"
          />
          <h1 className="text-2xl font-extrabold tracking-wide">店家登入</h1>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">密碼</label>
            <input
              type="password"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
              placeholder="密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {msg && (
            <div
              className={`text-sm text-center rounded-lg px-3 py-2 border ${
                msg.startsWith('✅')
                  ? 'text-emerald-200 bg-emerald-600/20 border-emerald-400/30'
                  : 'text-red-200 bg-red-600/20 border-red-400/30'
              }`}
            >
              {msg}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-semibold shadow-[0_6px_20px_rgba(255,193,7,.25)] hover:bg-amber-500 hover:shadow-[0_8px_24px_rgba(255,193,7,.35)] focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
            disabled={loading}
          >
            {loading ? '登入中…' : '登入'}
          </button>

          <a
            href="/store/new"
            className="block w-full text-center py-2.5 rounded-xl bg白/10 text-white border border-white/20 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-300 transition"
          >
            創辦帳號
          </a>

          <div className="text-center">
            <a
              href="/store/forgot-password"
              className="text-sm text-gray-400 hover:text-white"
            >
              忘記密碼？
            </a>
          </div>
        </form>
      </div>
    </main>
  )
}
