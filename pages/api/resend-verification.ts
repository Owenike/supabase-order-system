// pages/api/resend-verification.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server env')
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Nodemailer transporter (server-only).
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT || 587) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  try {
    const { email, redirectTo } = req.body || {}
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email required' })

    const redirectUrl = typeof redirectTo === 'string' && redirectTo.length ? redirectTo : `${NEXT_PUBLIC_APP_URL}/login`

    // Generate a signup/verification link using Supabase Admin generateLink (may vary by supabase-js version)
    // We cast to any because some supabase-js versions expose admin methods differently.
    const adminAny: any = (supabaseAdmin as any).auth?.admin ? (supabaseAdmin as any).auth.admin : (supabaseAdmin as any).auth

    if (!adminAny || typeof adminAny.generateLink !== 'function') {
      console.error('[resend-verification] admin.generateLink not available on this supabase client version')
      return res.status(500).json({ error: 'server not configured for admin.generateLink' })
    }

    const { data, error: genErr } = await adminAny.generateLink({
      type: 'signup',
      email,
      // options: { redirectTo: redirectUrl } // only if supported by generateLink implementation
    })

    if (genErr) {
      console.error('[resend-verification] generateLink error', genErr)
      return res.status(500).json({ error: 'failed to generate link', detail: (genErr as any).message || genErr })
    }

    const maybeLink =
      (data && ((data as any).action_link || (data as any).link || (data as any).url || (data as any).action_link)) || null

    if (!maybeLink) {
      console.warn('[resend-verification] generateLink returned no link, data:', data)
      return res.status(500).json({ error: 'no link returned from supabase admin.generateLink' })
    }

    const mailHtml = `
      <p>您好，您要求重新寄發註冊／驗證連結：</p>
      <p><a href="${maybeLink}">${maybeLink}</a></p>
      <p>若連結已過期或有問題，請聯絡平台管理員。</p>
    `
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Olinex'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: '重新寄發：完成註冊／驗證連結',
      html: mailHtml,
    }

    await transporter.sendMail(mailOptions)
    return res.status(200).json({ ok: true, sentTo: email })
  } catch (err: any) {
    console.error('[resend-verification] error', err)
    return res.status(500).json({ error: err?.message || 'server error' })
  }
}
