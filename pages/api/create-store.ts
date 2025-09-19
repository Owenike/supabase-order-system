// pages/api/create-store.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { storeName, ownerName, email, phone, password } = req.body || {}

  if (!storeName || !email || !password) {
    return res.status(400).json({ error: '缺少必要欄位' })
  }

  const storeId = uuidv4()

  // 試用期：now ~ now+3 天
  const start = new Date()
  const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000)

  try {
    // Step 1: 新增 stores（含負責人與試用起訖）
    const { error: storeErr } = await supabase
      .from('stores')
      .insert({
        id: storeId,
        name: storeName,
        owner_name: ownerName || null,   // ✅ 寫入負責人姓名
        email,
        phone,
        is_active: true,
        is_enabled: true,
        // ❌ 移除 manage_password，不再存明碼
        trial_start_at: start.toISOString(),
        trial_end_at: end.toISOString(),
      })
    if (storeErr) throw storeErr

    // Step 2: 建立 Supabase Auth 帳號
    const { error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'store' }
    })
    if (authErr) throw authErr

    // Step 3: 新增 store_user_links
    const { error: linkErr } = await supabase
      .from('store_user_links')
      .insert({ email, store_id: storeId })
    if (linkErr) throw linkErr

    // Step 4: 新增 store_accounts（bcrypt）
    const hash = await bcrypt.hash(password, 10)
    const { error: accErr } = await supabase
      .from('store_accounts')
      .insert({
        email,
        password_hash: hash,
        is_active: true,
        store_id: storeId,
        store_name: storeName,
      })
    if (accErr) throw accErr

    return res.status(200).json({
      success: true,
      store_id: storeId,
      trial_start_at: start.toISOString(),
      trial_end_at: end.toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Unknown error' })
  }
}
