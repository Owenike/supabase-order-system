// /pages/api/auth-resend-signup.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

/**
 * 重寄「註冊驗證信」
 * Body: { email: string; redirectTo?: string }
 * Response: { ok: true } | { error: string }
 *
 * 需在 Vercel/環境變數設定：
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NEXT_PUBLIC_SUPABASE_URL
 */

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const { email, redirectTo } = req.body as { email?: string; redirectTo?: string }
    const cleaned = String(email || '').trim().toLowerCase()

    if (!isValidEmail(cleaned)) {
      return res.status(400).json({ error: 'Invalid email' })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Missing Supabase service configuration' })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 使用 supabase-js v2 的 resend（以 service_role 呼叫）
    const { error } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email: cleaned,
      options: {
        // 沒傳就預設 /auth/callback
        emailRedirectTo: redirectTo || `${process.env.NEXT_PUBLIC_SITE_URL || supabaseUrl}/auth/callback`,
      },
    })

    if (error) {
      // 常見錯誤：User already confirmed / Rate limit
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({ ok: true })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal Server Error' })
  }
}
