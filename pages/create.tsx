// pages/create.tsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function CreateUserPage() {
  const router = useRouter()
  const [storeId, setStoreId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const id = router.query.store_id
    if (typeof id === 'string') {
      setStoreId(id)
    }
  }, [router.query.store_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (!storeId) {
      setMessage('❌ 缺少店家識別碼，請確認網址包含 store_id')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, store_id: storeId }),
      })

      const data = await res.json()
      if (res.ok) {
        setMessage(`✅ 建立成功：${data.user.email}`)
        setEmail('')
        setPassword('')
      } else {
        setMessage(`❌ 建立失敗：${data.error}`)
      }
    } catch {
      setMessage('❌ 系統錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '50px auto', fontFamily: 'sans-serif' }}>
      <h2>新增使用者帳號</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 10 }}>
          <label>Email：</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
            placeholder="請輸入 Email"
            style={{ width: '100%', padding: '8px', fontSize: '16px' }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>密碼：</label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              const asciiOnly = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
              setPassword(asciiOnly)
            }}
            required
            autoComplete="off"
            placeholder="僅限英文與數字"
            style={{ width: '100%', padding: '8px', fontSize: '16px' }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {loading ? '建立中...' : '建立帳號'}
        </button>
      </form>
      {message && (
        <p style={{ marginTop: 20, fontWeight: 'bold', color: message.includes('❌') ? 'red' : 'green' }}>
          {message}
        </p>
      )}
    </div>
  )
}
