// pages/api/create-store.ts
import { NextApiRequest, NextApiResponse } from 'next'
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

  const { name, email, phone, password } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: '缺少必要欄位' })
  }

  try {
    const storeId = uuidv4()

    // Step 1: 建立 stores 資料
    const { error: storeErr } = await supabase.from('stores').insert({
      id: storeId,
      name,
      email,
      phone,
      is_enabled: true,
      manage_password: password,
    })
    if (storeErr) throw storeErr

    // Step 2: 註冊 Supabase Auth 使用者
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'store' }
    })
    if (authErr) throw authErr

    // Step 3: 建立 store_accounts
    const password_hash = await bcrypt.hash(password, 10)
    const { error: accountErr } = await supabase.from('store_accounts').insert({
      email,
      password_hash,
      is_active: true,
      store_id: storeId,
      store_name: name,
    })
    if (accountErr) throw accountErr

    // Step 4: 建立 store_user_links
    const { error: linkErr } = await supabase.from('store_user_links').insert({
      email,
      store_id: storeId
    })
    if (linkErr) throw linkErr

    return res.status(200).json({ success: true, message: '店家帳號建立成功' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || '建立失敗' })
  }
}
