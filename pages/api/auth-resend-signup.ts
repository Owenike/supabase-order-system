// pages/api/auth-resend-signup.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`)
  }
  return v
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    // 用 anon key 建 client（這個端點在伺服器上，不會外露）
    const supa = createClient(url, anon, { auth: { persistSession: false } })

    const body = (req.body ?? {}) as Partial<{ email: string; redirectTo: string }>
    if (!body.email || typeof body.email !== 'string') {
      return res.status(400).json({ error: 'email is required' })
    }
    const rt =
      typeof body.redirectTo === 'string' && body.redirectTo.trim()
        ? body.redirectTo
        : 'https://www.olinex.app/auth/callback'

    const { data, error } = await supa.auth.resend({
      type: 'signup',
      email: body.email,
      options: { emailRedirectTo: rt },
    })
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ message: 'Resend signup email requested', data })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'unknown error' })
  }
}
