// pages/api/auth-invite.ts
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
    const serviceRole = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, serviceRole)

    const body = (req.body ?? {}) as Partial<{ email: string; redirectTo: string }>
    if (!body.email || typeof body.email !== 'string') {
      return res.status(400).json({ error: 'email is required' })
    }
    const safeEmail = body.email
    const rt = typeof body.redirectTo === 'string' && body.redirectTo.trim()
      ? body.redirectTo
      : 'https://www.olinex.app/auth/callback'

    const { data, error } = await admin.auth.admin.inviteUserByEmail(safeEmail, { redirectTo: rt })
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ message: 'Invite email sent (if SMTP configured)', data })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'unknown error' })
  }
}
