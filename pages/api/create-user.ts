// pages/api/create-user.ts
import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// 替換成你自己的網址與金鑰
const supabase = createClient(
  'https://your-project.supabase.co',
  '你的-service-role-key'
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只允許 POST 請求' })
  }

  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: '缺少 email 或 password' })
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 直接設為已驗證
  })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ message: '建立成功', user: data.user })
}
