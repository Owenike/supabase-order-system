// pages/create.tsx

import { useState } from 'react'

export default function CreateUserPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    // 密碼 ASCII 驗證
    const isValidPassword = /^[a-zA-Z0-9]+$/.test(password)
    if (!isValidPassword) {
      setMessage('❌ 密碼僅限英文與數字，不可包含中文或符號')
      setLoading(false)
      return
    }

    // Email ASCII 驗證
    const isValidEmail = /^[\x00-\x7F]+$/.test(email)
    if (!isValidEmail) {
      setMessage('❌ Email 格式錯誤，請勿包含中文或奇怪符號')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage(`✅ 建立成功：${data.user.email}`)
        setEmail('')
        setPassword('')
      } else {
        console.error('建立失敗錯誤內容：', data.error)
        setMessage('❌ 建立失敗，請確認輸入資訊是否正確')
      }
    } catch {
      setMessage('❌ 無法連線到伺服器')
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
            onChange={(e) => {
              const asciiOnly = e.target.value.replace(/[^\x00-\x7F]/g, '')
              setEmail(asciiOnly)
            }}
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
