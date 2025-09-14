import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const store_id = (req.method === 'GET' ? (req.query.store_id as string) : req.body?.store_id) || ''
    if (!UUID_RE.test(store_id)) return res.status(400).json({ error: 'Invalid store_id' })

    const { data, error } = await admin
      .from('store_feature_flags')
      .select('feature_key, enabled')
      .eq('store_id', store_id)
      .in('feature_key', ['dine_in', 'takeout'])

    if (error) return res.status(500).json({ error: error.message })

    const map = new Map<string, boolean>()
    ;(data || []).forEach((r: any) => map.set(r.feature_key, !!r.enabled))

    const dine_in = map.has('dine_in') ? !!map.get('dine_in') : true
    const takeout = map.has('takeout') ? !!map.get('takeout') : true

    return res.status(200).json({ ok: true, store_id, dine_in, takeout })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
