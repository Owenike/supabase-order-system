// pages/admin/new-store.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { formatROC, formatROCRange } from '@/lib/date'

type CreateResult = {
  success?: boolean
  error?: string
  store_id?: string
  trial_start_at?: string
  trial_end_at?: string
}

export default function NewStorePage() {
  const [storeName, setStoreName] = useState('')
  const [ownerName, setOwnerName] = useState('') // ✅ 新增：負責人姓名
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [trialRange, setTrialRange] = useState<string>('') // 顯示 期限114/..~114/..

  const handleCreate = async () => {
    setMessage('')
    setError('')
    setTrialRange('')
    setLoading(true)

    try {
      const res = await fetch('/api/create-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          ownerName, // ✅ 一併送到 API（API 未用到也不影響）
          phone,
          email,
          password,
        }),
      })

      const result: CreateResult = await res.json()
      if (!res.ok) throw new Error(result.error || '建立失敗')

      // 顯示三天期限（民國年）
      if (result.trial_start_at && result.trial_end_at) {
        setTrialRange(`期限${formatROCRange(result.trial_start_at, result.trial_end_at)}`)
      } else {
        // 萬一 API 沒回，也用前端推算（以今日起三天）
        const start = new Date()
        const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000)
        setTrialRange(`期限${formatROC(start)}~${formatROC(end)}`)
      }

      setMessage('✅ 店家帳號建立成功！')
      setStoreName('')
      setOwnerName('')
      setPhone('')
      setEmail('')
      setPassword('')
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message)
      else setError('建立失敗')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void handleCreate()
  }

  return (
    <main className="bg-[#0B0B0B] min-h-screen flex items-center justify-center px-4">
      {/* 只作用於此卡片：深色半透明 + Autofill 修正 */}
      <style jsx global>{`
        .auth-card input,
        .auth-card textarea,
        .auth-card select,
        .auth-card option {
          color: #fff !important;
          background-color: rgba(255, 255, 255, 0.06) !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff !important;
        }
        .auth-card ::placeholder {
          color: rgba(255, 255, 255, 0.5) !important;
        }
        .auth-card input:-webkit-autofill {
          -webkit-text-fill-color: #fff !important;
          box-shadow: 0 0 0px 1000px rgba(255, 255, 255, 0.06) inset !important;
          transition: background-color 5000s ease-in-out 0s !important;
          caret-color: #fff !important;
        }
      `}</style>

      <div className="auth-card w-full max-w-lg rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,.35)] p-6">
        <h1 className="text-2xl font-extrabold tracking-wide text-center mb-2">
          新增店家帳號
        </h1>
        <p className="text-center text-white/70 mb-6">建立後將自動啟用 <span className="text-amber-300 font-semibold">3 天試用</span></p>

        <form className="space-y-4" onSubmit={onSubmit}>
          {/* 店名 */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">店名</label>
            <input
              type="text"
              placeholder="店名"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
            />
          </div>

          {/* ✅ 負責人姓名（第二項） */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">負責人姓名</label>
            <input
              type="text"
              placeholder="負責人姓名"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>

          {/* ✅ 交換順序：電話在前，Email 在後 */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">電話</label>
            <input
              type="tel"
              placeholder="電話"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">密碼</label>
            <input
              type="password"
              placeholder="設定初始密碼"
              className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {/* 提示訊息 */}
          {message && (
            <div className="text-sm text-center rounded-lg px-3 py-2 border text-emerald-200 bg-emerald-600/20 border-emerald-400/30">
              {message} {trialRange ? `（${trialRange}）` : ''}
            </div>
          )}
          {error && (
            <div className="text-sm text-center rounded-lg px-3 py-2 border text-red-200 bg-red-600/20 border-red-400/30">
              {error}
            </div>
          )}

          {/* 黃色主按鈕 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-semibold shadow-[0_6px_20px_rgba(255,193,7,.25)] hover:bg-amber-500 hover:shadow-[0_8px_24px_rgba(255,193,7,.35)] focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {loading ? '建立中…' : '建立帳號'}
          </button>
        </form>
      </div>
    </main>
  )
}
