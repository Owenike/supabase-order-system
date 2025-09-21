// pages/api/admin/invite-info.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.query.token as string | undefined
  if (!token) return res.status(400).json({ error: 'token required' })

  try {
    const { data } = await supabaseAdmin
      .from('invites')
      .select('id, email, store_id, created_at, expires_at, used')
      .eq('token', token)
      .limit(1)
      .maybeSingle()

    if (!data) return res.status(404).json({ error: 'invite not found' })

    // 若需要，也可以查 store name
    const { data: store } = await supabaseAdmin.from('stores').select('name').eq('id', data.store_id).maybeSingle()

    return res.json({ invite: { ...data, store_name: store?.name } })
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ error: err?.message || 'server error' })
  }
}
