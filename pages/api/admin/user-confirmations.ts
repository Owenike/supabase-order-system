// /pages/api/admin/user-confirmations.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

/**
 * 以一批 email 查詢是否已驗證
 * Body: { emails: string[] }
 * Response: { rows: { email: string; confirmed: boolean; email_confirmed_at: string | null }[] }
 *
 * 需在 Vercel/環境變數設定：
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NEXT_PUBLIC_SUPABASE_URL
 */

type Row = {
  email: string
  confirmed: boolean
  email_confirmed_at: string | null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const { emails } = req.body as { emails?: string[] }

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails is required (non-empty array)' })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Missing Supabase service configuration' })
    }

    // 以 service_role 建立 Admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 去重、轉小寫
    const wanted = Array.from(new Set(emails.map((e) => String(e).trim().toLowerCase())))

    // 用 Admin API 分頁抓取 users，再過濾出我們需要的 email
    const rows: Row[] = []
    const wantedSet = new Set(wanted)

    // 一次抓 1000，直到集齊所有想要的 email 或無更多資料
    let page = 1
    const perPage = 1000
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (error) {
        return res.status(500).json({ error: error.message })
      }
      const users = data?.users ?? []

      // 從本批次挑出有在 wanted 內的
      for (const u of users) {
        const em = String(u.email ?? '').toLowerCase()
        if (wantedSet.has(em)) {
          rows.push({
            email: em,
            confirmed: Boolean(u.email_confirmed_at),
            email_confirmed_at: u.email_confirmed_at ?? null,
          })
          wantedSet.delete(em)
        }
      }

      // 都找到了或沒有下一頁就結束
      const hasMore = (data?.users?.length ?? 0) === perPage
      if (wantedSet.size === 0 || !hasMore) break
      page += 1
    }

    // 對於未在 Supabase 中找到的 email，也回傳一筆（confirmed=false）
    for (const missing of Array.from(wantedSet)) {
      rows.push({ email: missing, confirmed: false, email_confirmed_at: null })
    }

    return res.status(200).json({ rows })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal Server Error' })
  }
}
