// pages/api/auth-generate-link.ts
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
    const url: string = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    const serviceRole: string = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, serviceRole)

    const raw = (req.body ?? {}) as Partial<{
      email: string
      redirectTo: string
      // data: Record<string, any> // ← invite 類型不支援 user_metadata
    }>

    if (!raw.email || typeof raw.email !== 'string') {
      return res.status(400).json({ error: 'email is required' })
    }
    const safeEmail: string = raw.email
    const rt: string =
      typeof raw.redirectTo === 'string' && raw.redirectTo.trim().length > 0
        ? raw.redirectTo
        : 'https://www.olinex.app/auth/callback'

    // ✅ 對於 type: 'invite'，redirectTo 應放在 options 內；不要帶 data
    const { data: linkData, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: safeEmail,
      options: { redirectTo: rt },
    })

    if (error) return res.status(400).json({ error: error.message })

    return res.status(200).json({
      message: 'Generated invite link (no password required)',
      action_link: linkData?.properties?.action_link ?? null,
      hashed_token: linkData?.properties?.hashed_token ?? null,
      redirect_to_used: rt,
    })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'unknown error' })
  }
}
