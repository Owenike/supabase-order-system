import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, store_id, is_active } = req.body

  if (!email || !store_id || typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'Missing or invalid parameters' })
  }

  try {
    // 更新 store_accounts.is_active
    const { error: accErr } = await supabase.from('store_accounts')
      .update({ is_active })
      .eq('email', email)

    if (accErr) throw accErr

    // 更新 stores.is_active（與前端一致）
    const { error: storeErr } = await supabase.from('stores')
      .update({ is_active }) // ✅ 改為 is_active
      .eq('id', store_id)

    if (storeErr) throw storeErr

    return res.status(200).json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '更新失敗'
    return res.status(500).json({ error: message })
  }
}
