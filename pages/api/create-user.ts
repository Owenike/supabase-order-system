// pages/api/create-user.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

type CreateUserRequestBody = {
  email: string
  password: string
  store_id: string
}

type ErrorResponse = { error: string; detail?: string }

const ALLOWED_METHODS = ['POST', 'OPTIONS'] as const

/** 簡易 CORS（避免跨網域預檢失敗） */
function setCORS(res: NextApiResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization')
}

/** UUID 格式檢查 */
function isValidUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse | NextApiResponse<ErrorResponse>
) {
  setCORS(res)

  // 預檢請求
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // 方法限制
  if (!ALLOWED_METHODS.includes(req.method as (typeof ALLOWED_METHODS)[number])) {
    res.setHeader('Allow', ALLOWED_METHODS.join(', '))
    res.status(405).json({ error: 'Only POST method is allowed' })
    return
  }

  // === 1) x-admin-key 驗證 ===
  const expectedAdminKey = process.env.ADMIN_API_KEY
  if (!expectedAdminKey) {
    res.status(500).json({ error: 'Server misconfigured: ADMIN_API_KEY not set' })
    return
  }
  const headerAdminKeyRaw = req.headers['x-admin-key']
  const headerAdminKey = Array.isArray(headerAdminKeyRaw) ? headerAdminKeyRaw[0] : headerAdminKeyRaw
  if (!headerAdminKey || headerAdminKey !== expectedAdminKey) {
    res.status(403).json({ error: 'Forbidden: invalid or missing x-admin-key' })
    return
  }

  // === 2) 環境變數檢查 ===
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    res.status(500).json({
      error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set',
    })
    return
  }

  // 解析 body
  const body: CreateUserRequestBody =
    typeof req.body === 'string' ? (safeParse<CreateUserRequestBody>(req.body) ?? ({} as any)) : req.body

  const email = (body?.email ?? '').trim().toLowerCase()
  const password = (body?.password ?? '').trim()
  const store_id = (body?.store_id ?? '').trim()

  if (!email || !password || !store_id) {
    res.status(400).json({ error: 'Missing email, password, or store_id' })
    return
  }
  if (!email.includes('@')) {
    res.status(400).json({ error: 'Invalid email format' })
    return
  }
  if (!isValidUuid(store_id)) {
    res.status(400).json({ error: 'store_id 格式錯誤，請確認為 UUID 格式' })
    return
  }

  // ✅ 初始化 Supabase admin client
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // === 3) 建立使用者 ===
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr) {
      const msg = (createErr as any)?.message?.toString?.() ?? String(createErr)
      const lower = msg.toLowerCase()
      if (
        lower.includes('already') ||
        lower.includes('exists') ||
        lower.includes('registered') ||
        lower.includes('duplicate')
      ) {
        res.status(409).json({ error: 'Email 已存在，請使用其他帳號', detail: msg })
        return
      }
      res.status(500).json({ error: 'Failed to create user', detail: msg })
      return
    }

    const user = created?.user
    if (!user?.id) {
      res.status(500).json({ error: 'User created but missing user id' })
      return
    }

    // === 4) 綁定到店家 ===
    const { error: linkErr } = await supabase.from('store_user_links').insert({
      email,
      store_id,
    })

    if (linkErr) {
      res.status(500).json({
        error: '帳號已建立，但無法連結至店家',
        detail: linkErr.message,
      })
      return
    }

    // === 5) 成功 ===
    res.status(201).json({ error: '', detail: `User ${email} created successfully` })
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: 'Unexpected server error', detail })
  }
}

/** 安全 JSON 解析 */
function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}
