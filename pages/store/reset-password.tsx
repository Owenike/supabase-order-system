import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token')) {
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

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('密碼重設失敗：' + error.message)
    } else {
      setMessage('✅ 密碼已重設，請重新登入')
      setTimeout(() => router.push('/store/login'), 2000)
    }
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">🔐 重設密碼</h1>
      <input
        type="password"
        className="w-full border p-2 mb-3 rounded"
        placeholder="請輸入新密碼"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        type="password"
        className="w-full border p-2 mb-3 rounded"
        placeholder="再次輸入新密碼"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      <button
        onClick={handleReset}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        確認重設
      </button>

      {message && <p className="text-green-600 mt-3">{message}</p>}
      {error && <p className="text-red-600 mt-3">{error}</p>}
    </div>
  )
}
