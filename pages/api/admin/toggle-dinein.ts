import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient, type User } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 以 service_role 建立 Server 端客戶端（RLS 不生效）
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function isAdmin(user: User): Promise<boolean> {
  const um: any = user.user_metadata || {}
  const am: any = (user as any).app_metadata || {}

  const roles = new Set<string>()
  const push = (v: any) => {
    if (!v) return
    if (Array.isArray(v)) v.forEach((x) => x && roles.add(String(x)))
    else roles.add(String(v))
  }

  push(um.role)
  push(um.roles)
  push(am.role)
  push(am.roles)

  if (roles.has('admin')) return true

  // 從資料表補判斷（若沒有這些欄位也不會報錯）
  try {
    const { data } = await admin
      .from('store_accounts')
      .select('is_admin, role')
      .eq('email', user.email!)
      .maybeSingle()
    if (data?.is_admin === true) return true
    if (data?.role === 'admin') return true
  } catch {
    // ignore
  }
  return false
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    // 1) 取 Bearer token
    const authz = req.headers.authorization || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!token) {
      return res
        .status(401)
        .json({ error: 'Missing bearer token', hint: 'Send Authorization: Bearer <access_token>' })
    }

    // 2) 解析 user
    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes?.user) {
      return res
        .status(401)
        .json({ error: 'Invalid token', hint: userErr?.message || 'Cannot decode token' })
    }

    // 3) 判斷 admin
    const allowed = await isAdmin(userRes.user)
    if (!allowed) {
      return res
        .status(403)
        .json({ error: 'Forbidden: admin only', hint: 'Set role to admin in metadata or store_accounts' })
    }

    // 4) 參數與格式檢查
    const { store_id } = req.body as { store_id?: string }
    if (!store_id || !UUID_RE.test(store_id)) {
      return res.status(400).json({ error: 'Invalid store_id' })
    }

    // 5) 讀取現狀
    const { data: curr, error: selErr } = await admin
      .from('store_feature_flags')
      .select('enabled')
      .eq('store_id', store_id)
      .eq('feature_key', 'dine_in')
      .maybeSingle()
    if (selErr) return res.status(500).json({ error: selErr.message })

    // 無紀錄視為 true → 第一次點擊會切換為 false（封鎖）
    const newEnabled = !(curr ? !!curr.enabled : true)

    // 6) UPSERT 反轉
    const { error: upErr } = await admin
      .from('store_feature_flags')
      .upsert(
        {
          store_id,
          feature_key: 'dine_in',
          enabled: newEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,feature_key' }
      )
    if (upErr) return res.status(500).json({ error: upErr.message })

    return res.status(200).json({ ok: true, store_id, dine_in_enabled: newEnabled })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
