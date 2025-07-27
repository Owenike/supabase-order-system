'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

export default function NewStorePage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = session?.user?.user_metadata?.role
      if (!session || role !== 'admin') {
        router.replace('/admin/login')
      }
    })
  }, [router])

  const handleCreate = async () => {
    setMessage('')
    setError('')
    setLoading(true)

    try {
      // Step 1: 建立 stores 資料
      const storeId = uuidv4()
      const { error: storeErr } = await supabase
        .from('stores')
        .insert({
          id: storeId,
          name: storeName,
          email,
          phone,
          is_enabled: true,
          manage_password: password,
        })

      if (storeErr) throw storeErr

      // Step 2: 註冊 Supabase Auth 帳號
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'store' }
      })

      if (authErr) throw authErr

      // Step 3: 寫入 store_user_links
      const { error: linkErr } = await supabase
        .from('store_user_links')
        .insert({ email, store_id: storeId })

      if (linkErr) throw linkErr

      // Step 4: 寫入 store_accounts
      const hash = await bcrypt.hash(password, 10)
      const { error: accErr } = await supabase
        .from('store_accounts')
        .insert({
          email,
          password_hash: hash,
          is_active: true,
          store_id: storeId,
          store_name: storeName,
        })

      if (accErr) throw accErr

      setMessage('✅ 店家帳號建立成功！')
      setStoreName('')
      setEmail('')
      setPhone('')
      setPassword('')
    } catch (err: any) {
      setError(err.message || '建立失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-20 bg-white p-6 shadow rounded">
      <h1 className="text-2xl font-bold mb-6 text-center">新增店家帳號</h1>
      <div className="space-y-4">
        <input
          type="text"
          placeholder="店名"
          className="w-full border p-2 rounded"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          className="w-full border p-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="tel"
          placeholder="電話"
          className="w-full border p-2 rounded"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          type="password"
          placeholder="密碼"
          className="w-full border p-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700"
        >
          {loading ? '建立中...' : '建立帳號'}
        </button>

        {message && <p className="text-green-600 mt-4 text-center">{message}</p>}
        {error && <p className="text-red-600 mt-4 text-center">{error}</p>}
      </div>
    </div>
  )
}
