import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import bcrypt from 'bcryptjs'

export default function StoreLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setError('')

    // 查帳號（這裡加入 store_id 一起查出來）
    const { data: account, error: accountError } = await supabase
      .from('store_accounts')
      .select('id, password_hash, is_active, store_id') // ✅ 加入 store_id
      .eq('email', email)
      .single()

    if (accountError || !account) {
      setError('帳號不存在')
      return
    }

    if (!account.is_active) {
      setError('此帳號已被停用')
      return
    }

    const match = await bcrypt.compare(password, account.password_hash)
    if (!match) {
      setError('密碼錯誤')
      return
    }

    if (!account.store_id) {
      setError('此帳號尚未綁定店家')
      return
    }

    // ✅ 直接使用 store_accounts 中的 store_id 與 id 寫入 localStorage
    localStorage.setItem('store_id', account.store_id)
    localStorage.setItem('store_account_id', account.id)

    router.push('/store')
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">店家登入</h1>
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

      <p
        className="text-sm text-blue-600 mt-3 underline cursor-pointer text-center"
        onClick={() => router.push('/store/forgot-password')}
      >
        忘記密碼？
      </p>

      {error && <p className="text-red-600 mt-3">{error}</p>}
    </div>
  )
}
