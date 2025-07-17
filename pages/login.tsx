'use client'

import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // ✅ 清除殘留舊帳號資料
    localStorage.removeItem('store_id')
    localStorage.removeItem('store_account_id')

    const cleanedEmail = email.trim().toLowerCase()

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: cleanedEmail,
      password
    })

    if (loginError || !data.user) {
      setError('登入失敗，請確認帳號密碼')
      setLoading(false)
      return
    }

    // ✅ 以 email 查詢對應店家
    const { data: storeData, error: storeError } = await supabase
      .from('stores')
      .select('id')
      .eq('email', cleanedEmail)
      .single()

    console.log('🧪 查詢店家結果：', storeData)

    if (storeError || !storeData?.id) {
      setError('此帳號尚未對應到任何店家')
      setLoading(false)
      return
    }

    // ✅ 儲存登入後資料
    localStorage.setItem('store_id', storeData.id)
    console.log('✅ 登入成功，跳轉店家後台')

    router.push('/store')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-80 space-y-4">
        <h2 className="text-xl font-bold text-center">店家登入</h2>
        <input
          type="email"
          className="w-full border px-3 py-2 rounded"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          type="password"
          className="w-full border px-3 py-2 rounded"
          placeholder="密碼"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? '登入中...' : '登入'}
        </button>
      </form>
    </div>
  )
}
