import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// ✅ 初始化 Supabase client（請替換為你的專案設定）
const supabase = createClient(
  'https://cdzgifdgcaeswcdewwdl.supabase.co',
  '你的-service-role-key' // ⚠️ 建議改成 process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ✅ 定義請求內容型別
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

  // ✅ 正確指定 req.body 的型別（解決 ts2353）
  const body = req.body as CreateUserRequestBody
  const { email, password, store_id } = body

  if (!email || !password || !store_id) {
    return res.status(400).json({
      error: 'Missing email, password, or store_id',
    })
  }

  try {
    // ✅ 查詢所有使用者，並手動比對 email
    const { data: userList, error: listError } =
      await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('listUsers 查詢錯誤:', listError)
      return res.status(500).json({ error: 'Failed to check existing user' })
    }

    const emailExists = userList?.users?.some((user) => user.email === email)

    if (emailExists) {
      return res
        .status(409)
        .json({ error: 'Email 已存在，請使用其他帳號' })
    }

    // ✅ 建立帳號
    const { data: user, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (authError) {
      console.error('建立帳號錯誤:', authError)
      return res.status(500).json({ error: authError.message })
    }

    // ✅ 寫入帳號與店家對應關係
    const { error: insertError } = await supabase
      .from('store_user_links')
      .insert({ email, store_id })

    if (insertError) {
      console.error('寫入 store_user_links 失敗:', insertError)
      return res.status(500).json({
        error: '帳號已建立，但無法連結至店家',
      })
    }

    // ✅ 成功回傳
    return res.status(200).json({
      message: 'User created',
      user: user.user,
    })
  } catch (err) {
    console.error('Unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected server error' })
  }
}
