import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSend = async () => {
    setMessage('')
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/store/reset-password`
    })

    if (error) {
      setError('寄送失敗，請確認 Email 是否存在')
    } else {
      setMessage('✅ 重設連結已寄出，請至信箱查收')
    }
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">🔑 忘記密碼</h1>
      <input
        type="email"
        className="w-full border p-2 rounded mb-3"
        placeholder="請輸入註冊 Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        onClick={handleSend}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        寄送重設密碼連結
      </button>
      {message && <p className="text-green-600 mt-3">{message}</p>}
      {error && <p className="text-red-600 mt-3">{error}</p>}
    </div>
  )
}
