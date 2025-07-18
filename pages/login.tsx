'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    console.log('📥 點擊登入')

    setError('')
    setLoading(true)

    try {
      localStorage.removeItem('store_id')
      localStorage.removeItem('store_account_id')

      const cleanedEmail = email.trim().toLowerCase()
      console.log('🧹 清理並準備登入:', cleanedEmail)

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      })

      if (loginError || !data.user) {
        console.warn('❌ 登入失敗:', loginError?.message)
        setError('登入失敗，請確認帳號與密碼')
        setLoading(false)
        return
      }

      console.log('✅ Supabase 登入成功:', data.user.id)

      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('email', cleanedEmail)
        .single()

      if (storeError || !storeData?.id) {
        console.warn('❌ 查無對應店家')
        setError('此帳號尚未對應到任何店家')
        setLoading(false)
        return
      }

      console.log('🏪 找到對應店家 ID:', storeData.id)

      localStorage.setItem('store_id', storeData.id)
      setError('✅ 登入成功，正在導向後台...')
      console.log('🧭 準備跳轉...')

      await new Promise((resolve) => setTimeout(resolve, 300))

      console.log('🚀 跳轉中...')
      window.location.href = '/store'
    } catch (err) {
      console.error('💥 登入流程錯誤:', err)
      setError('發生未知錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-80 space-y-4">
        <h2 className="text-xl font-bold text-center">店家登入</h2>
        <input
          type="email"
          className="w-full border px-3 py-2 rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          className="w-full border px-3 py-2 rounded"
          placeholder="密碼"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <p className="text-sm text-center text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? '登入中...' : '登入'}
        </button>
      </div>
    </div>
  )
}
