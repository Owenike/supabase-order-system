// /pages/api/admin/repair-account.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

/**
 * 一鍵修復 API（僅限管理員）
 *
 * 目的：
 * 1) 以 email 找到該使用者 (auth.users)
 * 2) 找出使用者擁有的 store (public.stores.user_id = user.id)
 *    - 若沒有且 autoCreateStore=true → 建立一筆 store
 *    - 若有以相同 email 的舊 store（未綁 user_id 或綁錯人）→ 認領/改綁給正確 user_id
 * 3) 將 public.store_accounts 中同 email 的紀錄改綁到該 store_id，並啟用 is_active
 *    - 若該 email 有多筆 → 可選擇刪除多餘重複
 *
 * 呼叫方式（前端）：
 *   await fetch('/api/admin/repair-account', {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'x-admin-email': currentAdminEmail, // 範例：以 Email 白名單驗權（可改成你自己的判定）
 *     },
 *     body: JSON.stringify({
 *       email: targetEmail,
 *       autoCreateStore: true,
 *       deleteDuplicateAccounts: false,
 *     }),
 *   })
 *
 * 需要環境變數：
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (務必是 service_role)
 */

type ReqBody = {
  email?: string
  autoCreateStore?: boolean
  deleteDuplicateAccounts?: boolean
}

// 你可以改成檢查 JWT / 資料表 / 角色等更嚴格的驗證
const ADMIN_EMAIL_WHITELIST = new Set<string>([
  // TODO: 改成你的管理員 Email 白名單
  'bctc4869@gmail.com',
  'test1@qr.com',
])

function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ error: msg })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return bad(res, 405, 'Method Not Allowed')
  }

  // 基本校驗環境變數
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return bad(res, 500, 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  // 伺服器端 admin client（不受 RLS 限制）
  const supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    // ---- 簡單的管理員驗證（示範用）----
    const adminEmail = String(req.headers['x-admin-email'] || '').toLowerCase()
    if (!ADMIN_EMAIL_WHITELIST.has(adminEmail)) {
      return bad(res, 403, 'Permission denied: admin only')
    }

    // ---- 解析 body ----
    const { email, autoCreateStore = true, deleteDuplicateAccounts = false } = (req.body ?? {}) as ReqBody
    const cleanedEmail = String(email || '').toLowerCase().trim()
    if (!cleanedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      return bad(res, 400, 'Invalid email')
    }

    // ---- 1) 找使用者 (auth.users) ----
    // listUsers 沒有直接 by email 的查詢，這裡做簡單分頁（用戶量不大時可行；大量用戶建議改用管理端資料表映射）
    const usersResp = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersResp.error) {
      return bad(res, 500, `List users failed: ${usersResp.error.message}`)
    }
    const targetUser = (usersResp.data.users || []).find(
      (u) => String(u.email || '').toLowerCase() === cleanedEmail
    )
    if (!targetUser) {
      return bad(res, 404, 'User not found in auth')
    }

    // ---- 2) 找該使用者擁有的 store ----
    let storeId: string | null = null
    let storeName = '未命名店家'

    // 2-1 by user_id
    {
      const sel = await supabaseAdmin
        .from('stores')
        .select('id, name, email, user_id')
        .eq('user_id', targetUser.id)
        .maybeSingle()
      if (sel.error) return bad(res, 500, `Query store by user_id failed: ${sel.error.message}`)

      if (sel.data?.id) {
        storeId = sel.data.id
        storeName = sel.data.name || storeName
      }
    }

    // 2-2 若還沒有，試著用 email 認領既有 store（若綁錯人則改綁）
    if (!storeId) {
      const byEmail = await supabaseAdmin
        .from('stores')
        .select('id, name, user_id')
        .eq('email', cleanedEmail)
        .maybeSingle()
      if (byEmail.error) return bad(res, 500, `Query store by email failed: ${byEmail.error.message}`)

      if (byEmail.data?.id) {
        // 改綁到本人
        const upd = await supabaseAdmin
          .from('stores')
          .update({ user_id: targetUser.id })
          .eq('id', byEmail.data.id)
        if (upd.error) return bad(res, 500, `Claim store failed: ${upd.error.message}`)
        storeId = byEmail.data.id
        storeName = byEmail.data.name || storeName
      } else if (autoCreateStore) {
        // 2-3 若仍沒有 → 建立新 store
        const ins = await supabaseAdmin
          .from('stores')
          .insert({ user_id: targetUser.id, email: cleanedEmail, name: storeName })
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

    // ---- 3) 對齊/改綁 store_accounts ----
    // 3-1 by store_id
    const accByStore = await supabaseAdmin
      .from('store_accounts')
      .select('id')
      .eq('store_id', storeId)
      .maybeSingle()
    if (accByStore.error) return bad(res, 500, `Query account by store_id failed: ${accByStore.error.message}`)

    if (accByStore.data?.id) {
      const upd = await supabaseAdmin
        .from('store_accounts')
        .update({ email: cleanedEmail, store_name: storeName, is_active: true })
        .eq('id', accByStore.data.id)
      if (upd.error) return bad(res, 500, `Update account(by store) failed: ${upd.error.message}`)
    } else {
      // 3-2 by email（可能綁了別的 store）
      const accByEmail = await supabaseAdmin
        .from('store_accounts')
        .select('id, store_id')
        .eq('email', cleanedEmail)

      if (accByEmail.error) return bad(res, 500, `Query account by email failed: ${accByEmail.error.message}`)

      if ((accByEmail.data || []).length > 0) {
        // 改綁全部到正確 store_id（如要更嚴格，可只改綁 store_id 為 null 或同 store 的）
        const ids = (accByEmail.data || []).map((r) => r.id)
        const claim = await supabaseAdmin
          .from('store_accounts')
          .update({ store_id: storeId, store_name: storeName, is_active: true })
          .in('id', ids)
        if (claim.error) return bad(res, 500, `Claim accounts failed: ${claim.error.message}`)
      } else {
        // 3-3 都沒有 → 建立
        const insAcc = await supabaseAdmin
          .from('store_accounts')
          .insert({ store_id: storeId, email: cleanedEmail, store_name: storeName, is_active: true })
        if (insAcc.error) return bad(res, 500, `Create account failed: ${insAcc.error.message}`)
      }
    }

    // 3-4 可選：刪除重複帳號（保留一筆）
    if (deleteDuplicateAccounts) {
      const dup = await supabaseAdmin
        .from('store_accounts')
        .select('id')
        .eq('email', cleanedEmail)
      if (dup.error) return bad(res, 500, `Query dups failed: ${dup.error.message}`)

      const ids = (dup.data || []).map((r) => r.id)
      if (ids.length > 1) {
        const keep = ids[0]
        const remove = ids.slice(1)
        const del = await supabaseAdmin.from('store_accounts').delete().in('id', remove)
        if (del.error) return bad(res, 500, `Delete duplicates failed: ${del.error.message}`)
      }
    }

    // ---- 4) 最終確認 ----
    const final = await supabaseAdmin
      .from('store_accounts')
      .select('id, store_id, email, is_active, store_name')
      .eq('store_id', storeId)
    if (final.error) return bad(res, 500, `Final check failed: ${final.error.message}`)

    return res.status(200).json({
      ok: true,
      user_id: targetUser.id,
      store_id: storeId,
      accounts: final.data || [],
    })
  } catch (e: any) {
    return bad(res, 500, e?.message || 'Internal Server Error')
  }
}
