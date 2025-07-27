import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CreateAdminRequestBody = {
  email: string
  password: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST method is allowed' })
  }

  const { email, password } = req.body as CreateAdminRequestBody
  console.log('✅ 收到的 req.body:', req.body)

  if (!email || !password) {
    return res.status(400).json({
      error: 'Missing email or password',
    })
  }

  try {
    const { data: userList, error: listError } =
      await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('❌ listUsers 查詢錯誤:', listError)
      return res.status(500).json({
        error: 'Failed to check existing user',
        detail: listError.message,
      })
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
        user_metadata: {
          role: 'admin',
        },
      })

    if (authError) {
      console.error('❌ 建立帳號錯誤:', authError)
      return res.status(500).json({ error: authError.message })
    }

    return res.status(200).json({ message: '管理員已建立', user: user.user })
  } catch (err: unknown) {
    console.error('❌ Unhandled error:', err)
    return res.status(500).json({
      error: 'Unexpected server error',
      detail: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
