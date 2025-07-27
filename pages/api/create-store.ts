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

  const { storeName, email, phone, password } = req.body

  if (!storeName || !email || !password) {
    return res.status(400).json({ error: '缺少必要欄位' })
  }

  const storeId = uuidv4()

  try {
    // Step 1: 新增 stores
    const { error: storeErr } = await supabase
      .from('stores')
      .insert({
        id: storeId,
        name: storeName,
        email,
        phone,
        is_enabled: true,
        manage_password: password,
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

    // Step 4: 新增 store_accounts
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

    return res.status(200).json({ success: true })
  } catch (err: unknown) {
    if (err instanceof Error) {
      return res.status(500).json({ error: err.message })
    } else {
      return res.status(500).json({ error: 'Unknown error' })
    }
  }
}
