import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// ✅ 改為讀取 .env 設定（避免金鑰外洩）
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CreateUserRequestBody = {
  email: string
  password: string
  store_id: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST method is allowed' })
  }

  const { email, password, store_id } = req.body as CreateUserRequestBody

  if (!email || !password || !store_id) {
    return res.status(400).json({
      error: 'Missing email, password, or store_id',
    })
  }

  try {
    const { data: userList, error: listError } =
      await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('❌ listUsers 查詢錯誤:', listError)
      return res
        .status(500)
        .json({ error: 'Failed to check existing user', detail: listError.message })
    }

    const emailExists = userList?.users?.some((user) => user.email === email)

    if (emailExists) {
      return res.status(409).json({ error: 'Email 已存在，請使用其他帳號' })
    }

    const { data: user, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (authError) {
      console.error('❌ 建立帳號錯誤:', authError)
      return res.status(500).json({ error: authError.message })
    }

    const { error: insertError } = await supabase
      .from('store_user_links')
      .insert({ email, store_id })

    if (insertError) {
      console.error('❌ 寫入 store_user_links 失敗:', insertError)
      return res.status(500).json({ error: '帳號已建立，但無法連結至店家' })
    }

    return res.status(200).json({ message: 'User created', user: user.user })
  } catch (err: unknown) {
    console.error('❌ Unhandled error:', err)
    return res.status(500).json({
      error: 'Unexpected server error',
      detail: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
