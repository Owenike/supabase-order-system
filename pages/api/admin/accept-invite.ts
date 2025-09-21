// pages/api/admin/accept-invite.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })
  const { token, email } = req.body || {}
  if (!token || !email) return res.status(400).json({ error: 'token & email required' })

  try {
    // 1) 找 invite
    const { data: invites } = await supabaseAdmin
      .from('invites')
      .select('*')
      .eq('token', token)
      .limit(1)

    const invite = invites && invites[0]
    if (!invite) return res.status(404).json({ error: 'invite not found' })
    if (invite.used) return res.status(400).json({ error: 'invite already used' })
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'invite expired' })

    // 2) 找 auth.users（應該已由前端 signUp 建立）
    const { data: users } = await supabaseAdmin
      .from('auth.users')
      .select('id,email')
      .eq('email', email)
      .limit(1)

    const user = users && users[0]
    if (!user) return res.status(400).json({ error: 'user not found; please complete sign-up first' })

    // 3) 更新 store.owner_user_id
    const { error: upErr } = await supabaseAdmin
      .from('stores')
      .update({ owner_user_id: user.id })
      .eq('id', invite.store_id)

    if (upErr) {
      console.error('[accept-invite] update store err', upErr)
      return res.status(500).json({ error: 'failed to bind store' })
    }

    // 4) 把 invite 標成已使用
    await supabaseAdmin.from('invites').update({ used: true }).eq('id', invite.id)

    return res.json({ ok: true })
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ error: err?.message || 'server error' })
  }
}
