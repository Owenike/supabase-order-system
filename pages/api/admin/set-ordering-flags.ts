// /pages/api/admin/set-ordering-flags.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const authz = req.headers.authorization || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })

    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes?.user) return res.status(401).json({ error: 'Invalid token' })
    const role = (userRes.user.user_metadata as any)?.role
    if (role !== 'admin') return res.status(403).json({ error: 'Forbidden' })

    const { store_id, enabled } = req.body as { store_id?: string; enabled?: boolean }
    if (!store_id || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'store_id and enabled are required' })
    }

    const payload = [
      { store_id, feature_key: 'dine_in', enabled },
      { store_id, feature_key: 'takeout', enabled },
    ]

    const { error: upErr } = await admin
      .from('store_feature_flags')
      .upsert(payload, { onConflict: 'store_id,feature_key' })

    if (upErr) return res.status(500).json({ error: upErr.message })

    return res.status(200).json({ ok: true, store_id, dine_in: enabled, takeout: enabled })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
