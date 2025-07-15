// pages/api/create-user.ts

import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cdzgifdgcaeswcdewwdl.supabase.co',
  '你的-service-role-key'
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' })
  }

  const { email, password, store_id } = req.body

  if (!email || !password || !store_id) {
    return res.status(400).json({ error: 'Missing email, password or store_id' })
  }

  try {
    // ✅ 先檢查 Supabase Auth 中是否已存在此帳號
    const { data: existingAuthUser, error: authCheckError } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (authCheckError) {
      console.error('auth.users 查詢錯誤:', authCheckError)
      return res.status(500).json({ error: 'Failed to check existing user' })
    }

    if (existingAuthUser) {
      return res.status(409).json({ error: 'Email 已存在，請使用其他帳號' })
    }

    // ✅ 建立帳號
    const { data: user, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      return res.status(500).json({ error: authError.message })
    }

    // ✅ 插入對應到哪個店家
    const { error: insertError } = await supabase.from('store_user_links').insert({
      email,
      store_id,
    })

    if (insertError) {
      console.error('插入 store_user_links 錯誤:', insertError)
      return res.status(500).json({ error: '建立帳號成功，但無法連結至店家' })
    }

    return res.status(200).json({ message: 'User created', user: user.user })
  } catch (err) {
    console.error('Unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected server error' })
  }
}
