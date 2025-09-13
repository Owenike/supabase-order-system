// pages/api/auth/callback.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

/**
 * 接收前端傳來的 session，使用 @supabase/ssr 將 token 寫入 Cookie。
 * 之後 API 端就能用 createServerSupabaseClient 讀到登入狀態。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const supabase = createServerSupabaseClient(req, res)
    const { event, session } = req.body ?? {}

    // 有 session：設定 Cookie
    if (session?.access_token && session?.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token as string,
        refresh_token: session.refresh_token as string,
      })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true, event: event || 'UNKNOWN', set: true })
    }

    // 沒有 session：代表登出或初次無狀態，清除 Cookie
    await supabase.auth.signOut()
    return res.status(200).json({ ok: true, event: event || 'UNKNOWN', set: false })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
