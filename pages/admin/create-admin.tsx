'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

export default function CreateAdminPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  // ✅ 確保只有管理員可以進來
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.user_metadata?.role !== 'admin') {
        router.replace('/admin/login')
      } else {
        setSessionReady(true)
      }
    }
    void checkSession()
  }, [router])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || '建立失敗')
      } else {
        setMessage('✅ 管理員帳號建立成功')
        setEmail('')
        setPassword('')
      }
    } catch {
      setError('發生錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  if (!sessionReady) return null

  return (
    <div className="max-w-md mx-auto mt-20 px-4 py-8 bg-white border rounded shadow">
      <h1 className="text-2xl font-bold mb-6 text-center">新增平台管理員</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          className="w-full border px-3 py-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="密碼"
          className="w-full border px-3 py-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 transition"
        >
          {loading ? '建立中...' : '建立帳號'}
        </button>
      </form>
      {message && <p className="text-green-600 mt-4 text-center">{message}</p>}
      {error && <p className="text-red-600 mt-4 text-center">{error}</p>}
    </div>
  )
}
