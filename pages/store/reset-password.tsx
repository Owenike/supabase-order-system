'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [validLink, setValidLink] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (hash.includes('access_token')) {
      setValidLink(true)
    } else {
      setError('無效的連結，請重新申請重設密碼')
    }
  }, [])

  const handleReset = async () => {
    setMessage('')
    setError('')

    if (password.length < 6) {
      setError('密碼長度至少 6 碼')
      return
    }
    if (password !== confirmPassword) {
      setError('兩次密碼輸入不一致')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('密碼重設失敗：' + error.message)
    } else {
      setMessage('✅ 密碼已重設，請重新登入')
      setTimeout(() => router.push('/login'), 2000)
    }
    setLoading(false)
  }

  return (
    <main className="bg-[#0B0B0B] min-h-screen flex items-center justify-center px-4">
      {/* Autofill 修正樣式（與 login/forgot 一致） */}
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

      <div className="auth-card w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow p-6">
        <h1 className="text-2xl font-extrabold tracking-wide text-center mb-4">
          🔐 重設密碼
        </h1>

        {!validLink && (
          <p className="text-center text-red-400">
            {error || '無效的連結'}
          </p>
        )}

        {validLink && (
          <>
            <input
              type="password"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 mb-3 focus:outline-none"
              placeholder="請輸入新密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 mb-3 focus:outline-none"
              placeholder="再次輸入新密碼"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              onClick={handleReset}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-semibold shadow hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 transition"
            >
              {loading ? '重設中…' : '確認重設'}
            </button>
          </>
        )}

        {message && (
          <p className="text-green-400 text-center mt-3">{message}</p>
        )}
        {error && validLink && (
          <p className="text-red-400 text-center mt-3">{error}</p>
        )}
      </div>
    </main>
  )
}
