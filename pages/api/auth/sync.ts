// /pages/api/auth/sync.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

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
  res.setHeader('Access-Control-Max-Age', '600') // 預檢快取 10 分鐘
  res.setHeader('Cache-Control', 'no-store')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCORS(res)

  // 預檢請求
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  // 僅接受 POST；其他一律 204（避免干擾前端流程）
  if (req.method !== 'POST') {
    res.status(204).end()
    return
  }

  try {
    const supabase = createServerSupabaseClient(req, res)

    // 兼容 body 為字串或已解析的 JSON
    let parsed: Body = {}
    try {
      parsed =
        typeof req.body === 'string'
          ? (JSON.parse(req.body) as Body)
          : ((req.body ?? {}) as Body)
    } catch {
      parsed = {}
    }

    const session = parsed.session ?? null

    // 有 token → 設定 cookie（登入 / token 刷新 / 初始化）
    if (session?.access_token && session?.refresh_token) {
      await supabase.auth
        .setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
        .catch(() => undefined)

      res.status(204).end()
      return
    }

    // 無 token → 視為登出，清除 cookie
    await supabase.auth.signOut().catch(() => undefined)
    res.status(204).end()
  } catch {
    // 任何例外都吞掉，維持 204，不阻斷前端主流程
    res.status(204).end()
  }
}
