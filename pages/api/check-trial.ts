// pages/api/check-trial.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server env')
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' })

  try {
    // 1) get access token from Authorization header or cookie
    const authHeader = (req.headers.authorization || '') as string
    let accessToken = ''
    if (authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.slice('Bearer '.length)
    } else if (req.cookies && req.cookies['sb-access-token']) {
      accessToken = req.cookies['sb-access-token']
    }

    if (!accessToken) {
      return res.status(200).json({ authenticated: false })
    }

    // 2) get user with admin.getUser (server-side)
    const { data: userData, error: getUserErr } = await supabaseAdmin.auth.getUser(accessToken)
    if (getUserErr || !userData?.user) {
      return res.status(200).json({ authenticated: false })
    }

    const user = userData.user
    const email = user.email || ''

    // 3) find store by store_user_links.email
    const { data: link } = await supabaseAdmin
      .from('store_user_links')
      .select('store_id')
      .eq('email', email)
      .limit(1)
      .maybeSingle()

    if (!link?.store_id) {
      return res.status(200).json({ authenticated: true, has_store: false, user_email: email })
    }

    // 4) read store info
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id,name,trial_end_at,is_active')
      .eq('id', link.store_id)
      .limit(1)
      .maybeSingle()

    if (!store) {
      return res.status(200).json({ authenticated: true, has_store: false, user_email: email })
    }

    const trialEnd = store.trial_end_at ? new Date(store.trial_end_at).getTime() : null
    const now = Date.now()
    const expired = trialEnd ? now > trialEnd : false

    return res.status(200).json({
      authenticated: true,
      has_store: true,
      store_id: store.id,
      store_name: store.name,
      trial_end_at: store.trial_end_at || null,
      is_active: !!store.is_active,
      expired,
    })
  } catch (err: any) {
    console.error('[check-trial] error', err)
    return res.status(500).json({ error: err?.message || 'server error' })
  }
}
