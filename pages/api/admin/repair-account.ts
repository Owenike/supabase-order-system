// /pages/api/admin/repair-account.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

/**
 * 一鍵修復 API（僅限管理員）
 * 驗權邏輯：
 * 1) 優先從 Supabase Cookie 解析目前登入者 email
 * 2) 後備：從 header 'x-admin-email'
 * 3) 僅允許 admin: bctc4869@gmail.com
 *
 * 需要環境變數：
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *  - SUPABASE_SERVICE_ROLE_KEY
 */

type ReqBody = {
  email?: string
  autoCreateStore?: boolean
  deleteDuplicateAccounts?: boolean
}

const ADMIN_ONLY = 'bctc4869@gmail.com' // 你的唯一管理員

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

  // 1) 解析目前登入者 email（Cookie -> header 後備）
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
  } catch {
    // ignore
  }
  if (!requesterEmail) {
    requesterEmail = String(req.headers['x-admin-email'] || '').toLowerCase().trim()
  }

  if (requesterEmail !== ADMIN_ONLY) {
    return bad(res, 403, `Permission denied: admin only (requester=${requesterEmail || 'unknown'})`)
  }

  // 2) Admin client（service_role，不受 RLS 限制）
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    // ✅ 只解構一次，避免 ts(2451) 重複宣告
    const {
      email,
      autoCreateStore = true,
      deleteDuplicateAccounts = false,
    } = (req.body ?? {}) as ReqBody

    const cleanedEmail = String(email || '').toLowerCase().trim()
    if (!cleanedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      return bad(res, 400, 'Invalid email')
    }

    // 3) 找使用者（auth.users）
    const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersResp.error) return bad(res, 500, `List users failed: ${usersResp.error.message}`)
    const user = (usersResp.data.users || []).find(
      (u) => String(u.email || '').toLowerCase() === cleanedEmail
    )
    if (!user) return bad(res, 404, 'User not found in auth')

    // 4) 決定 store：by user_id → by email 認領 →（可選）建立
    let storeId: string | null = null
    let storeName = '未命名店家'

    const byUid = await admin
      .from('stores')
      .select('id, name, email, user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (byUid.error) return bad(res, 500, `Query store by user_id failed: ${byUid.error.message}`)

    if (byUid.data?.id) {
      storeId = byUid.data.id
      storeName = byUid.data.name || storeName
    } else {
      const byEmail = await admin
        .from('stores')
        .select('id, name, user_id')
        .eq('email', cleanedEmail)
        .maybeSingle()
      if (byEmail.error) return bad(res, 500, `Query store by email failed: ${byEmail.error.message}`)

      if (byEmail.data?.id) {
        const claim = await admin.from('stores').update({ user_id: user.id }).eq('id', byEmail.data.id)
        if (claim.error) return bad(res, 500, `Claim store failed: ${claim.error.message}`)
        storeId = byEmail.data.id
        storeName = byEmail.data.name || storeName
      } else if (autoCreateStore) {
        const ins = await admin
          .from('stores')
          .insert({ user_id: user.id, email: cleanedEmail, name: storeName })
          .select('id, name')
          .maybeSingle()
        if (ins.error) return bad(res, 500, `Create store failed: ${ins.error.message}`)
        storeId = ins.data?.id || null
        storeName = ins.data?.name || storeName
      } else {
        return bad(res, 409, 'No store for this user; set autoCreateStore=true to create one.')
      }
    }
    if (!storeId) return bad(res, 500, 'No store_id resolved')

    // 5) 修復 store_accounts：by store_id → by email 認領 → insert；啟用 is_active
    const accByStore = await admin
      .from('store_accounts')
      .select('id')
      .eq('store_id', storeId)
      .maybeSingle()
    if (accByStore.error) return bad(res, 500, `Query account by store_id failed: ${accByStore.error.message}`)

    if (accByStore.data?.id) {
      const upd = await admin
        .from('store_accounts')
        .update({ email: cleanedEmail, store_name: storeName, is_active: true })
        .eq('id', accByStore.data.id)
      if (upd.error) return bad(res, 500, `Update account(by store) failed: ${upd.error.message}`)
    } else {
      const accByEmail = await admin
        .from('store_accounts')
        .select('id, store_id')
        .eq('email', cleanedEmail)
      if (accByEmail.error) return bad(res, 500, `Query account by email failed: ${accByEmail.error.message}`)

      if ((accByEmail.data || []).length > 0) {
        const ids = (accByEmail.data || []).map((r) => r.id)
        const claim = await admin
          .from('store_accounts')
          .update({ store_id: storeId, store_name: storeName, is_active: true })
          .in('id', ids)
        if (claim.error) return bad(res, 500, `Claim accounts failed: ${claim.error.message}`)
      } else {
        const insAcc = await admin
          .from('store_accounts')
          .insert({ store_id: storeId, email: cleanedEmail, store_name: storeName, is_active: true })
        if (insAcc.error) return bad(res, 500, `Create account failed: ${insAcc.error.message}`)
      }
    }

    // 6) （可選）刪除重複帳號（保留一筆）
    if (deleteDuplicateAccounts) {
      const dup = await admin.from('store_accounts').select('id').eq('email', cleanedEmail)
      if (dup.error) return bad(res, 500, `Query dups failed: ${dup.error.message}`)
      const ids = (dup.data || []).map((r) => r.id)
      if (ids.length > 1) {
        const remove = ids.slice(1)
        const del = await admin.from('store_accounts').delete().in('id', remove)
        if (del.error) return bad(res, 500, `Delete duplicates failed: ${del.error.message}`)
      }
    }

    // 7) 最終確認
    const final = await admin
      .from('store_accounts')
      .select('id, store_id, email, is_active, store_name')
      .eq('store_id', storeId)
    if (final.error) return bad(res, 500, `Final check failed: ${final.error.message}`)

    return res.status(200).json({
      ok: true,
      admin: requesterEmail,
      user_id: user.id,
      store_id: storeId,
      accounts: final.data || [],
    })
  } catch (e: any) {
    return bad(res, 500, e?.message || 'Internal Server Error')
  }
}
