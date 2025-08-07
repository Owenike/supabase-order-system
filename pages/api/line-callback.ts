import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LINE_CHANNEL_ID = '2007831464'
const LINE_CHANNEL_SECRET = '75a4d7c805b4368f0315de42d5ae6d31'
const REDIRECT_URI = 'https://www.olinex.app/api/line-callback'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = req.query.code as string
  const store = req.query.store as string || 'unknown'
  const table = req.query.table as string || '外帶'
  const userAgent = req.headers['user-agent'] || 'unknown'

  if (!code) {
    await supabase.from('login_logs').insert({
      line_user_id: 'MISSING',
      error_message: 'Missing LINE authorization code',
      user_agent: userAgent,
      store_id: store
    })
    const fallbackUrl = `/order?store=${encodeURIComponent(store)}&table=${encodeURIComponent(table)}`
    return res.redirect(302, fallbackUrl)
  }

  try {
    // 1. 取得 access_token
    const tokenRes = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    const { access_token } = tokenRes.data as {
      access_token: string
      id_token: string
      expires_in: number
      refresh_token?: string
      scope: string
      token_type: string
    }

    // 2. 取得使用者資料
    const profileRes = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${access_token}` }
    })

    const { userId, displayName, pictureUrl } = profileRes.data as {
      userId: string
      displayName: string
      pictureUrl?: string
    }

    // 3. 儲存到 Supabase
    const { data: existing } = await supabase
      .from('line_users')
      .select('id')
      .eq('line_user_id', userId)
      .maybeSingle()

    if (!existing) {
      await supabase.from('line_users').insert({
        line_user_id: userId,
        display_name: displayName,
        picture_url: pictureUrl
      })
    }

    // ✅ 4. 改為用 query 傳值，不使用 cookie
    const redirectUrl = `/order?store=${encodeURIComponent(store)}&table=${encodeURIComponent(table)}&line_user_id=${encodeURIComponent(userId)}`
    return res.redirect(302, redirectUrl)

  } catch (err: unknown) {
    const errorObj = err as any
    const errorMessage = errorObj?.response?.data?.error_description || errorObj?.message || 'Unknown callback error'

    await supabase.from('login_logs').insert({
      line_user_id: 'MISSING',
      error_message: `LINE callback error: ${errorMessage}`,
      user_agent: userAgent,
      store_id: store
    })

    const fallbackUrl = `/order?store=${encodeURIComponent(store)}&table=${encodeURIComponent(table)}`
    return res.redirect(302, fallbackUrl)
  }
}
