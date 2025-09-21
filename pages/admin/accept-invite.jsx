// pages/admin/accept-invite.jsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

export default function AcceptInvitePage() {
  const [token, setToken] = useState('')
  const [invite, setInvite] = useState(null)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    if (t) {
      setToken(t)
      fetch(`/api/admin/invite-info?token=${encodeURIComponent(t)}`)
        .then((r) => r.json())
        .then((json) => {
          if (json?.invite) setInvite(json.invite)
          else setError(json?.error || '找不到邀請或已失效')
        })
    } else {
      setError('缺少邀請 token')
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')
    if (!invite?.email) { setError('邀請資料不存在'); return; }
    if (!password || password.length < 8) { setError('密碼至少 8 碼'); return; }

    setLoading(true)
    try {
      // 1) 前端使用者 signup
      const { data, error } = await supabase.auth.signUp({
        email: invite.email,
        password,
      })

      if (error) {
        // 若 email 已存在，提示 user 用忘記密碼或登入
        setError(error.message)
        setLoading(false)
        return
      }

      // 2) call backend accept-invite to bind store -> user
      const resp = await fetch('/api/admin/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: invite.email }),
      })
      const jb = await resp.json()
      if (!resp.ok) throw new Error(jb.error || 'binding failed')

      setMessage('註冊完成！請到 Email 完成驗證後再登入。')
    } catch (err) {
      if (err instanceof Error) setError(err.message)
      else setError('註冊失敗')
    } finally { setLoading(false) }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white/5 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-2">接受邀請</h2>
        {invite ? (
          <div className="mb-4">
            <p>邀請 Email：<strong>{invite.email}</strong></p>
            <p>店家：<strong>{invite.store_name || invite.store_id}</strong></p>
            <p className="text-sm text-gray-400">請設定密碼，完成註冊後系統會綁定此店家給你。</p>
          </div>
        ) : (
          <div className="mb-4 text-red-500">{error || '載入中...'}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input value={invite?.email || ''} disabled className="w-full p-2 bg-gray-800 rounded" />
          <input type="password" placeholder="設定密碼 (至少 8 碼)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 bg-gray-800 rounded" />
          <button disabled={loading || !invite} type="submit" className="w-full py-2 bg-amber-400 rounded text-black font-semibold">
            {loading ? '處理中…' : '註冊並綁定店家'}
          </button>
        </form>

        {message && <div className="mt-3 text-green-600">{message}</div>}
        {error && <div className="mt-3 text-red-500">{error}</div>}
      </div>
    </main>
  )
}
