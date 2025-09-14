import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient, type User } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 允許用環境變數白名單 admin（逗號分隔）
const ADMIN_EMAILS =
  (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function isAdmin(user: User): Promise<boolean> {
  if (!user) return false

  // 1) 環境變數白名單
  const email = (user.email || '').toLowerCase()
  if (email && ADMIN_EMAILS.includes(email)) return true

  // 2) metadata roles
  const um: any = user.user_metadata || {}
  const am: any = (user as any).app_metadata || {}
  const roles = new Set<string>()
  const push = (v: any) => {
    if (!v) return
    if (Array.isArray(v)) v.forEach(x => x && roles.add(String(x)))
    else roles.add(String(v))
  }
  push(um.role); push(um.roles); push(am.role); push(am.roles)
  if (roles.has('admin')) return true

  // 3) store_accounts 表（有就判，沒有就忽略）
  try {
    const { data } = await admin
      .from('store_accounts')
      .select('is_admin, role')
      .eq('email', user.email!)
      .maybeSingle()
    if (data?.is_admin === true) return true
    if (data?.role === 'admin') return true
  } catch { /* ignore */ }

  return false
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    // Bearer token
    const authz = req.headers.authorization || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token', hint: 'Send Authorization: Bearer <access_token>' })
    }

    // 取 user
    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes?.user) {
      return res.status(401).json({ error: 'Invalid token', hint: userErr?.message || 'Cannot decode token' })
    }

    // 判斷 admin
    const allowed = await isAdmin(userRes.user)
    if (!allowed) return res.status(403).json({ error: 'Forbidden: admin only' })

    // 參數
    const { store_id, enabled } = req.body as { store_id?: string; enabled?: boolean }
    if (!store_id || !UUID_RE.test(store_id) || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Invalid payload', hint: 'store_id(UUID)+enabled(boolean) required' })
    }

    // 以 service_role upsert 兩個旗標
    const payload = [
      { store_id, feature_key: 'dine_in',  enabled },
      { store_id, feature_key: 'takeout',  enabled },
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
