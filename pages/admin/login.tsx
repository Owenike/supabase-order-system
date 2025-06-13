import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import bcrypt from 'bcryptjs'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setError('')

    const { data, error } = await supabase
      .from('store_accounts')
      .select('id, email, password_hash')
      .eq('email', email)
      .single()

    if (error || !data) {
      setError('帳號錯誤')
      return
    }

    const match = await bcrypt.compare(password, data.password_hash)
    if (!match) {
      setError('密碼錯誤')
      return
    }

    localStorage.setItem('admin_id', data.id)
    router.push('/admin/dashboard')
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">平台管理員登入</h1>
      <input
        type="email"
        className="w-full border p-2 mb-3 rounded"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="w-full border p-2 mb-3 rounded"
        placeholder="密碼"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        onClick={handleLogin}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        登入
      </button>
      {error && <p className="text-red-600 mt-3">{error}</p>}
    </div>
  )
}
