import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// ✅ 初始化 Supabase client（讀取環境變數）
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

  // ✅ 顯示傳入資料內容以利除錯
  console.log('✅ 收到的 req.body:', req.body)

  const { email, password, store_id } = req.body as CreateUserRequestBody

  if (!email || !password || !store_id) {
    return res.status(400).json({
      error: 'Missing email, password, or store_id',
    })
  }

  // ✅ 驗證 store_id 格式為 UUID
  const isValidUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(val)

  if (!isValidUuid(store_id)) {
    return res.status(400).json({ error: 'store_id 格式錯誤，請確認為 UUID 格式' })
  }

  try {
    // ✅ 查詢現有使用者，避免重複建立
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

    // ✅ 建立新帳號
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

    // ✅ 將帳號與店家綁定
    const { error: insertError } = await supabase
      .from('store_user_links')
      .insert({ email, store_id })

    if (insertError) {
      console.error('❌ 寫入 store_user_links 失敗:', insertError)
      return res.status(500).json({
        error: '帳號已建立，但無法連結至店家',
        detail: insertError.message,
      })
    }

    // ✅ 成功建立
    return res.status(200).json({ message: 'User created', user: user.user })
  } catch (err: unknown) {
    console.error('❌ Unhandled error:', err)
    return res.status(500).json({
      error: 'Unexpected server error',
      detail: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
