// pages/api/create-user.ts

import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// 請填入你的 Supabase 專案資料
const supabase = createClient(
  'https://cdzgifdgcaeswcdewwdl.supabase.co',
  '你的 service_role key'
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' })
  }

  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' })
  }

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ message: 'User created', user: data.user })
  } catch (err: any) {
    return res.status(500).json({ error: 'Unexpected server error' })
  }
}
