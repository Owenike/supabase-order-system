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

  // 取得網址中的 store_id（含 isReady 等待 Router 準備好）
  useEffect(() => {
    if (!router.isReady) return
    const id = router.query.store_id
    console.log('🟡 取得網址參數 store_id:', id)
    if (typeof id === 'string') {
      setStoreId(id)
    } else {
      console.warn('❌ 無法從網址取得 store_id')
    }
  }, [router.isReady, router.query.store_id])

  // 建立帳號
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    // 🟡 加上送出前確認資料的 log
    console.log('🟡 送出前確認資料:', {
      email,
      password,
      store_id: storeId,
    })

    if (!email || !password || !storeId) {
      setMessage('❌ 請確認 Email、密碼與網址中的 store_id 都有填寫')
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
        console.error('❌ API 回傳錯誤:', data)
        setMessage(`❌ 建立失敗：${data.error}`)
      }
    } catch (error) {
      console.error('❌ 呼叫 API 發生錯誤:', error)
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
        <p
          style={{
            marginTop: 20,
            fontWeight: 'bold',
            color: message.includes('❌') ? 'red' : 'green',
          }}
        >
          {message}
        </p>
      )}
    </div>
  )
}
