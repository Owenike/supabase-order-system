import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import bcrypt from 'bcryptjs'

export default function NewStorePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [storeName, setStoreName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleCreate = async () => {
    setError('')
    if (!email || !password || !storeName) {
      setError('請填寫所有欄位')
      return
    }

    const password_hash = await bcrypt.hash(password, 10)

    const { error } = await supabase.from('store_accounts').insert({
      email,
      password_hash,
      store_name: storeName,
      is_active: true
    })

    if (error) {
      setError('建立失敗：' + error.message)
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/admin/dashboard'), 1000)
    }
  }

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">➕ 新增店家帳號</h1>
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
      <input
        type="text"
        className="w-full border p-2 mb-3 rounded"
        placeholder="店名"
        value={storeName}
        onChange={(e) => setStoreName(e.target.value)}
      />
      <button
        onClick={handleCreate}
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        建立帳號
      </button>

      {error && <p className="text-red-600 mt-3">{error}</p>}
      {success && <p className="text-green-600 mt-3">✅ 建立成功！</p>}
    </div>
  )
}
