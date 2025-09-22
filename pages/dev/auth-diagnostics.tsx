// pages/dev/auth-diagnostics.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AuthDiagnostics() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('12345678')
  const [log, setLog] = useState<string>('')

  const append = (obj: any) =>
    setLog((s) => s + '\n' + (typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)))

  const runSignUp = async () => {
    setLog('')
    const redirect = `${window.location.origin}/auth/callback`
    append({ envUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, redirect })
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirect },
    })
    append({ signUpData: data, signUpError: error?.message ?? null })
  }

  const runResend = async () => {
    const { data, error } = await supabase.auth.resend({ type: 'signup', email })
    append({ resendData: data, resendError: error?.message ?? null })
  }

  const callGenerateLink = async () => {
    const r = await fetch('/api/auth-generate-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo: `${window.location.origin}/auth/callback` }),
    })
    const j = await r.json()
    append({ generateLinkResp: j })
  }

  const callInvite = async () => {
    const r = await fetch('/api/auth-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const j = await r.json()
    append({ inviteResp: j })
  }

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white p-6">
      <h1 className="text-xl font-bold mb-4">Auth Diagnostics</h1>

      <div className="space-y-3 max-w-xl">
        <input
          className="w-full rounded px-3 py-2 bg-white/10 border border-white/20"
          placeholder="你的 email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded px-3 py-2 bg-white/10 border border-white/20"
          placeholder="測試密碼（至少 6 碼）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex gap-2 flex-wrap">
          <button className="px-3 py-2 rounded bg-amber-400 text-black" onClick={runSignUp}>
            signUp()
          </button>
          <button className="px-3 py-2 rounded bg-white/10" onClick={runResend}>
            resend(signup)
          </button>
          <button className="px-3 py-2 rounded bg-white/10" onClick={callGenerateLink}>
            admin.generateLink(signup)
          </button>
          <button className="px-3 py-2 rounded bg-white/10" onClick={callInvite}>
            admin.inviteUserByEmail()
          </button>
        </div>

        <pre className="whitespace-pre-wrap text-xs bg-black/40 p-3 rounded border border-white/10">
{log || 'log…'}
        </pre>
      </div>
    </main>
  )
}
