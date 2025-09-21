// pages/api/auth/callback.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

/**
 * 前端在 INITIAL / SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT 等事件時呼叫，
 * 目的：把 Supabase session 與後端 Cookie 對齊。
 *
 * 設計原則：
 * - 永遠回 204（No Content），避免在 UI 造成噪音或中斷主要流程
 * - 兼容字串或 JSON body
 * - 支援 OPTIONS / 簡單 CORS
 * - 任何錯誤都吞掉（記錄在伺服器 log 即可），不回 5xx
 */

type SessionLike = {
  access_token?: string
  refresh_token?: string
  expires_at?: number
}

type Body = {
  event?: string
  session?: SessionLike | null
}

function setCORS(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCORS(res)

  // 預檢請求直接放行
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  // 只接受 POST；其餘不報錯，直接 204 結束，避免噪音
  if (req.method !== 'POST') {
    res.status(204).end()
    return
  }

  try {
    const supabase = createServerSupabaseClient(req, res)

    // 兼容 body 是字串或 JSON 的情況
    let parsed: Body = {}
    try {
      parsed =
        typeof req.body === 'string'
          ? (JSON.parse(req.body) as Body)
          : ((req.body ?? {}) as Body)
    } catch {
      // 解析失敗也不中斷
      parsed = {}
    }

    const event = parsed?.event ?? ''
    const session = parsed?.session ?? null

    // 有 token → 設定 Cookie（登入/刷新/初始同步）
    if (session?.access_token && session?.refresh_token) {
      // setSession 會自動在 res 上設定 Cookie（HttpOnly/SameSite 等由 @supabase/ssr 處理）
      await supabase.auth.setSession({
        access_token: session.access_token as string,
        refresh_token: session.refresh_token as string,
      })
      // 無論成功或失敗都不拋錯，直接結束
      res.status(204).end()
      return
    }

    // 沒 token → 當作登出/清 Cookie
    // （signOut 失敗也不影響主要流程）
    await supabase.auth.signOut().catch(() => void 0)

    res.status(204).end()
  } catch {
    // 最外層任何例外都吞掉，避免 5xx
    res.status(204).end()
  }
}
