'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!data.session || error) {
        setMessage('❌ 無法驗證權限，請重新點擊密碼重設信件')
      }
      setLoading(false)
    }

    void checkSession()
  }, [])

  const handleReset = async () => {
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setMessage('❌ 密碼更新失敗：' + error.message)
    } else {
      setMessage('✅ 密碼更新成功，3 秒後跳轉登入頁')
      setTimeout(() => router.push('/login'), 3000)
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>重設密碼</h1>

      {loading ? (
        <p>正在驗證權限中...</p>
      ) : (
        <>
          <input
            type="password"
            placeholder="請輸入新密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={handleReset}>更新密碼</button>
          <p>{message}</p>
        </>
      )}
    </div>
  )
}
