// pages/api/admin/user-confirmations.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

type Row = {
  email: string
  confirmed: boolean
  email_confirmed_at: string | null
}

type AuthUserRow = {
  email: string
  email_confirmed_at: string | null
}

/** 拿必要環境變數（同時做 runtime 檢查） */
function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`)
  }
  return v
}

/** 將未知錯誤轉為可讀字串 */
function getErrorMessage(e: unknown): string {
  if (!e) return 'unknown error'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  try { return JSON.stringify(e) } catch { return String(e) }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    const serviceRole = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, serviceRole)

    // 解析 body：{ emails: string[] }
    const body = (req.body ?? {}) as Partial<{ emails: unknown }>
    if (!Array.isArray(body.emails) || body.emails.length === 0) {
      return res.status(400).json({ error: 'emails is required (non-empty array)' })
    }

    // 正規化成小寫、唯一
    const emails: string[] = Array.from(
      new Set(
        body.emails
          .map((e) => (typeof e === 'string' ? e : String(e)))
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.length > 0)
      )
    )

    // ✅ 用 schema('auth')，再指定回傳型別 .returns<AuthUserRow[]>()
    const { data, error } = await admin
      .schema('auth')
      .from('users')
      .select('email,email_confirmed_at')
      .in('email', emails)
      .returns<AuthUserRow[]>()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // 建立 email -> confirmed 對照
    const map = new Map<string, { email_confirmed_at: string | null }>()
    ;(data ?? []).forEach((u) => {
      map.set(u.email.toLowerCase(), { email_confirmed_at: u.email_confirmed_at })
    })

    // 以請求順序回傳結果；查不到者視為未驗證
    const rows: Row[] = emails.map((email) => {
      const hit = map.get(email)
      const confirmedAt = hit?.email_confirmed_at ?? null
      return {
        email,
        confirmed: Boolean(confirmedAt),
        email_confirmed_at: confirmedAt,
      }
    })

    return res.status(200).json({ ok: true, count: rows.length, rows })
  } catch (e: unknown) {
    return res.status(500).json({ error: getErrorMessage(e) })
  }
}
