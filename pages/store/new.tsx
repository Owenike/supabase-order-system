// pages/store/new.tsx
'use client'

import { useState, type FormEvent, useEffect } from 'react'
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

  // 防連點冷卻（避免 email rate limit exceeded）
  const COOLDOWN_SECONDS = 60
  const [cooldown, setCooldown] = useState<number>(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const router = useRouter()

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  }

  const handleSignup = async () => {
    if (loading || cooldown > 0) return
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
      // ✅ signUp 會自動寄出「驗證信」
      //    這裡的 redirect 必須與 Supabase Auth → URL configuration 白名單一致
      const emailRedirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanedEmail,
        password,
        options: {
          emailRedirectTo,
          data: {
            store_name: storeName,
            owner_name: ownerName || null,
            phone: phone || null,
          },
        },
      })

      if (signUpError) {
        const raw = (signUpError.message || '').toLowerCase()

        // 常見：限流
        if (raw.includes('rate limit') || raw.includes('too many') || raw.includes('429')) {
          setError('寄送太頻繁，請稍後再試（約 1 分鐘後）')
          setCooldown(COOLDOWN_SECONDS)
          return
        }
        // 常見：Email 已註冊
        if (
          raw.includes('already') ||
          raw.includes('exists') ||
          raw.includes('registered') ||
          raw.includes('duplicate')
        ) {
          setError('此 Email 已被註冊，請直接登入或使用忘記密碼')
          return
        }

        // 其他錯誤
        console.error('signUp error:', signUpError)
        setError(signUpError.message || '註冊失敗，請稍後再試')
        return
      }

      // 明確檢查：成功通常會回傳 user（尚未確認 email）
      if (!data?.user?.email) {
        setError('註冊流程異常，未取得使用者資訊。請稍後再試。')
        return
      }

      // ✅ 只在真的成功時顯示「已寄出」
      setMessage(`✅ 註冊成功！已寄驗證信到 ${cleanedEmail}，請至信箱完成驗證。`)
      setCooldown(COOLDOWN_SECONDS)

      // 清空欄位
      setStoreName('')
      setOwnerName('')
      setPhone('')
      setEmail('')
      setPassword('')

      // 3 秒後導回登入頁（你原本的行為）
      setTimeout(() => {
        router.replace('/login')
      }, 3000)
    } catch (err: unknown) {
      console.error('signUp exception:', err)
      setError(err instanceof Error ? err.message : '註冊失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void handleSignup()
  }

  const disabled = loading || cooldown > 0

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

        {/* 兩行固定說明 */}
        <div className="text-center text-white/70 mb-6 leading-relaxed">
          <span className="block">
            建立帳號後，系統會寄
            <span className="text-amber-300 font-semibold"> 驗證信 </span>
            至 Email
          </span>
          <span className="block mt-1">
            完成驗證即可獲得
            <span className="text-amber-300 font-semibold"> 3 天 </span>
            試用
          </span>
        </div>

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
            {loading
              ? '註冊中…'
              : cooldown > 0
              ? `請稍候 ${cooldown} 秒後重試`
              : '建立帳號'}
          </button>
        </form>
      </div>
    </main>
  )
}
