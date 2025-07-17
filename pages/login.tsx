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

    try {
      // ✅ 清除舊登入資料
      localStorage.removeItem('store_id')
      localStorage.removeItem('store_account_id')

      const cleanedEmail = email.trim().toLowerCase()

      // ✅ 登入 Supabase
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      })

      if (loginError || !data.user) {
        setError('登入失敗，請確認帳號與密碼')
        setLoading(false)
        return
      }

      // ✅ 查詢店家 ID
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

      // ✅ 寫入 localStorage 並延遲跳轉
      localStorage.setItem('store_id', storeData.id)
      setError('✅ 登入成功，正在導向後台...')

      // ✅ 等待寫入完成後再導向，避免 store 頁面讀不到
      await new Promise((resolve) => setTimeout(resolve, 300))
      router.replace('/store')
    } catch (err) {
      console.error('登入流程發生錯誤：', err)
      setError('發生未知錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded shadow-md w-80 space-y-4"
      >
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
