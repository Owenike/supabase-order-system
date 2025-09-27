// /pages/api/auth-resend-signup.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

/**
 * 重寄「註冊驗證信」
 * POST Body: { email: string; redirectTo?: string }
 * Response: 200 -> { ok: true }
 *           4xx/5xx -> { error: string }
 *
 * 需要環境變數：
 * - NEXT_PUBLIC_SUPABASE_URL           // 你的 Supabase 專案 URL（公開）
 * - SUPABASE_SERVICE_ROLE_KEY          // service_role（僅後端）
 * - NEXT_PUBLIC_SITE_URL (建議)        // 你的站台主網址，例如 https://www.olinex.app
 * - ALLOWED_REDIRECTS (可選)           // 以逗號分隔的允許 redirect 前綴，例如:
 *                                      // "https://www.olinex.app,https://preview-olinex.vercel.app"
 */

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}
function norm(str: unknown) {
  return String(str ?? '').trim()
}
function chooseSiteUrl(req: NextApiRequest): string {
  const envSite = norm(process.env.NEXT_PUBLIC_SITE_URL)
  if (envSite) return envSite.replace(/\/+$/, '')
  // 後備：用請求的 Origin（同網域呼叫時可用）
  const origin = norm(req.headers.origin)
  if (origin) return origin.replace(/\/+$/, '')
  // 最後備援：用 Supabase URL（不理想，但可避免空值）
  const supa = norm(process.env.NEXT_PUBLIC_SUPABASE_URL)
  return supa.replace(/\/+$/, '')
}
function isAllowedRedirect(url: string, allowList: string[]): boolean {
  try {
    const u = new URL(url)
    return allowList.some((prefix) => {
      try {
        const p = new URL(prefix)
        return u.origin === p.origin && u.pathname.startsWith(p.pathname)
      } catch {
        // prefix 不是完整 URL，就比對字首
        return url.startsWith(prefix)
      }
    })
  } catch {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const supabaseUrl = norm(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const serviceRoleKey = norm(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase service configuration' })
  }

  try {
    const body = (req.body ?? {}) as { email?: string; redirectTo?: string }
    const email = norm(body.email).toLowerCase()
    let redirectTo = norm(body.redirectTo)

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' })
    }

    // 構出預設 redirect（/auth/callback）
    const siteUrl = chooseSiteUrl(req) || 'https://example.com'
    const defaultRedirect = `${siteUrl}/auth/callback`

    // 建立允許清單
    const allowedFromEnv = norm(process.env.ALLOWED_REDIRECTS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const allowedRedirects = [defaultRedirect, siteUrl, ...allowedFromEnv]

    // 驗證/回退 redirectTo，避免 invalid redirect url
    if (!redirectTo || !isAllowedRedirect(redirectTo, allowedRedirects)) {
      redirectTo = defaultRedirect
    }

    // 以 service_role 呼叫 supabase-admin
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    const { error } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    })

    if (error) {
      // 儘量保留狀態碼與訊息
      const status = (error as any).status ?? 400
      return res.status(status).json({ error: error.message })
    }

    return res.status(200).json({ ok: true })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal Server Error' })
  }
}
