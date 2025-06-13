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

    // 查帳號
    const { data: account, error: accountError } = await supabase
      .from('store_accounts')
      .select('id, password_hash, is_active, store_name')
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

    // ✅ 根據 store_name 去 stores 表找出 store_id
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id')
      .eq('name', account.store_name)
      .single()

    if (storeError || !store) {
      setError('找不到對應店家資料')
      return
    }

    // ✅ 寫入 store_id 與 store_account_id 到 localStorage
    localStorage.setItem('store_id', store.id)
    localStorage.setItem('store_account_id', account.id)

    router.push('/store/index')
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
