// pages/store/new.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

export default function NewStoreSignupPage() {
  const [storeName, setStoreName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  }

  const handleSignup = async () => {
    if (loading) return
    setMessage('')
    setError('')

    // --- 基本驗證 ---
    const cleanedEmail = email.trim().toLowerCase()
    if (!storeName.trim()) {
      setError('請輸入店名')
      return
    }
    if (!isValidEmail(cleanedEmail)) {
      setError('請輸入有效的 Email')
      return
    }
    if (password.length < 6) {
      setError('密碼長度至少 6 碼')
      return
    }

    setLoading(true)
    try {
      // ✅ 使用 signUp：會自動寄出「驗證信」
      //    emailRedirectTo：使用者完成驗證後導回的頁面（可改成你要的）
      const { error: signUpError } = await supabase.auth.signUp({
        email: cleanedEmail,
        password,
        options: {
          emailRedirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/login`
              : undefined,
          data: {
            store_name: storeName,
            owner_name: ownerName || null,
            phone: phone || null,
          },
        },
      })

      if (signUpError) throw signUpError

      setMessage(`✅ 註冊成功！已寄驗證信到 ${cleanedEmail}，請至信箱完成驗證。`)
      // 清空欄位
      setStoreName('')
      setOwnerName('')
      setPhone('')
      setEmail('')
      setPassword('')

      // 3 秒後導回登入頁
      setTimeout(() => {
        router.replace('/login')
      }, 3000)
    } catch (err: unknown) {
      console.error('signUp error:', err)
      setError(err instanceof Error ? err.message : '註冊失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void handleSignup()
  }

  const disabled = loading

  return (
    <main className="bg-[#0B0B0B] min-h-screen flex items-center justify-center px-4">
      {/* 與 login/forgot/reset 一致的 Autofill 修正 */}
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

      <div className="auth-card w-full max-w-lg rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,.35)] p-6">
        <h1 className="text-2xl font-extrabold tracking-wide text-center mb-2">
          店家自助註冊
        </h1>
<p className="text-center text-white/70 mb-6">
  建立帳號後，系統會自動寄送
  <span className="text-amber-300 font-semibold"> 驗證信 </span>
  <br className="hidden sm:block" />
  完成驗證即可獲得
  <span className="text-amber-300 font-semibold"> 3 天 </span>
  試用
</p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm text-gray-300 mb-1">店名</label>
            <input
              type="text"
              placeholder="店名"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 focus:outline-none"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
              disabled={disabled}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">負責人姓名</label>
            <input
              type="text"
              placeholder="負責人姓名"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 focus:outline-none"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              disabled={disabled}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">電話</label>
            <input
              type="tel"
              placeholder="電話"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 focus:outline-none"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={disabled}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={disabled}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">密碼</label>
            <input
              type="password"
              placeholder="輸入密碼（至少 6 碼）"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={disabled}
            />
          </div>

          {message && (
            <div className="text-sm text-center rounded-lg px-3 py-2 border text-emerald-200 bg-emerald-600/20 border-emerald-400/30">
              {message}
            </div>
          )}
          {error && (
            <div className="text-sm text-center rounded-lg px-3 py-2 border text-red-200 bg-red-600/20 border-red-400/30">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={disabled}
            className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-semibold shadow hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 transition"
          >
            {loading ? '註冊中…' : '建立帳號'}
          </button>
        </form>
      </div>
    </main>
  )
}
