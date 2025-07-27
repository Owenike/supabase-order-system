import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, store_id } = req.body

  if (!email || !store_id) {
    return res.status(400).json({ error: 'Missing email or store_id' })
  }

  try {
    await supabase.from('store_user_links').delete().eq('store_id', store_id)
    await supabase.from('store_accounts').delete().eq('email', email)
    await supabase.from('stores').delete().eq('id', store_id)

    // 刪除 Supabase Auth 使用者
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
    if (listErr) throw listErr

    const target = list.users.find((u) => u.email === email)
    if (target) {
      await supabase.auth.admin.deleteUser(target.id)
    }

    return res.status(200).json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '刪除失敗'
    return res.status(500).json({ error: message })
  }
}
