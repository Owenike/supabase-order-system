// /pages/api/admin/repair-account.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

/**
 * 一鍵修復（核可 primary）API（僅限管理員）
 * 功能：
 *  - 指定 email + store_id，把該筆 store_account 設為 is_primary=true, approved_at=now(), is_active=true
 *  - 同 email 的其他帳號一律 is_primary=false（允許存在，但未核可）
 *
 * 需要環境變數：
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *  - SUPABASE_SERVICE_ROLE_KEY（注意：必須是 service_role）
 */
type ReqBody = {
  email?: string
  store_id?: string
}

const ADMIN_EMAIL = 'bctc4869@gmail.com'

function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ error: msg })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return bad(res, 405, 'Method Not Allowed')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return bad(res, 500, 'Missing Supabase environment variables')
  }

  // 1) 驗管理員
  let requesterEmail = ''
  try {
    const ssr = createServerClient(url, anonKey, {
      cookies: {
        get: (name: string) => req.cookies[name],
        set: () => {},
        remove: () => {},
      },
    })
    const { data } = await ssr.auth.getUser()
    requesterEmail = String(data?.user?.email || '').toLowerCase()
  } catch {}
  if (!requesterEmail) {
    requesterEmail = String(req.headers['x-admin-email'] || '').toLowerCase().trim()
  }
  if (requesterEmail !== ADMIN_EMAIL) {
    return bad(res, 403, `Permission denied (requester=${requesterEmail || 'unknown'})`)
  }

  // 2) 參數
  const { email, store_id } = (req.body ?? {}) as ReqBody
  const cleanedEmail = String(email || '').trim().toLowerCase()
  const storeId = String(store_id || '').trim()
  if (!cleanedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
    return bad(res, 400, 'Invalid email')
  }
  if (!storeId || !/^[0-9a-f-]{36}$/i.test(storeId)) {
    return bad(res, 400, 'Invalid store_id')
  }

  // 3) admin client
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    // 3-1) 確認 store 存在（可選）
    const { data: storeRow, error: storeErr } = await admin
      .from('stores')
      .select('id, name')
      .eq('id', storeId)
      .maybeSingle()
    if (storeErr) return bad(res, 500, `Query store failed: ${storeErr.message}`)
    if (!storeRow?.id) return bad(res, 404, 'Store not found')

    // 3-2) 找此 email 是否已有該店的 store_account
    const { data: existingAcc, error: exErr } = await admin
      .from('store_accounts')
      .select('id')
      .eq('email', cleanedEmail)
      .eq('store_id', storeId)
      .maybeSingle()
    if (exErr) return bad(res, 500, `Query account failed: ${exErr.message}`)

    let accountId = existingAcc?.id as string | undefined

    // 若沒有，先建立一筆（啟用）
    if (!accountId) {
      const { data: ins, error: insErr } = await admin
        .from('store_accounts')
        .insert({
          store_id: storeId,
          email: cleanedEmail,
          store_name: storeRow.name || null,
          is_active: true,
        })
        .select('id')
        .single()
      if (insErr) return bad(res, 500, `Create account failed: ${insErr.message}`)
      accountId = ins?.id
    }

    // 3-3) 同 email 其它帳號取消 primary
    const { error: clrErr } = await admin
      .from('store_accounts')
      .update({ is_primary: false })
      .ilike('email', cleanedEmail)
    if (clrErr) return bad(res, 500, `Clear primary failed: ${clrErr.message}`)

    // 3-4) 指定此筆為 primary + 啟用 + 核可時間
    const { error: setErr } = await admin
      .from('store_accounts')
      .update({ is_primary: true, is_active: true, approved_at: new Date().toISOString() })
      .eq('id', accountId!)
    if (setErr) return bad(res, 500, `Set primary failed: ${setErr.message}`)

    // 3-5) 回傳該 email 所有帳號現況
    const { data: accounts, error: finErr } = await admin
      .from('store_accounts')
      .select('id, store_id, email, is_active, is_primary, store_name, approved_at')
      .ilike('email', cleanedEmail)
      .order('created_at', { ascending: false })
    if (finErr) return bad(res, 500, `Final list failed: ${finErr.message}`)

    return res.status(200).json({
      ok: true,
      admin: requesterEmail,
      store_id: storeId,
      primary_account_id: accountId,
      accounts: accounts || [],
    })
  } catch (e: any) {
    return bad(res, 500, e?.message || 'Internal Server Error')
  }
}
