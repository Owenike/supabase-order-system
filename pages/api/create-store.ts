// pages/api/create-store.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { v4 as uuidv4 } from 'uuid'
import fetch from 'node-fetch' // node 18+ 的環境 fetch 可直接用（若無請用 node-fetch）

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase env not set')
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT || 587) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// --- rate limit helper (DB-backed) ---
async function checkAndIncrRateLimit(key: string, endpoint: string, limit = 10, windowSec = 3600) {
  // key should be unique per client (e.g. ip)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + windowSec * 1000).toISOString()

  // try select existing
  const { data: existing, error: selErr } = await supabaseAdmin
    .from('api_rate_limits')
    .select('*')
    .eq('key', key)
    .limit(1)
    .maybeSingle()

  if (selErr) {
    console.error('[rate-limit] select err', selErr)
    // fail-open: allow if DB read fails
    return { allowed: true }
  }

  if (!existing) {
    // insert new row
    const { error: insErr } = await supabaseAdmin.from('api_rate_limits').insert({
      key,
      endpoint,
      count: 1,
      expires_at: expiresAt,
    })
    if (insErr) console.error('[rate-limit] insert err', insErr)
    return { allowed: true, remaining: limit - 1 }
  }

  // existing found
  const exp = existing.expires_at ? new Date(existing.expires_at).getTime() : 0
  if (exp < Date.now()) {
    // expired window: reset
    const { error: updErr } = await supabaseAdmin.from('api_rate_limits').update({
      count: 1,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq('key', key)
    if (updErr) console.error('[rate-limit] reset err', updErr)
    return { allowed: true, remaining: limit - 1 }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0 }
  }

  // increment
  const { error: incErr } = await supabaseAdmin.from('api_rate_limits').update({
    count: existing.count + 1,
    updated_at: new Date().toISOString()
  }).eq('key', key)
  if (incErr) console.error('[rate-limit] inc err', incErr)
  return { allowed: true, remaining: Math.max(0, limit - (existing.count + 1)) }
}

// --- reCAPTCHA verify helper (optional, only if RECAPTCHA_SECRET set) ---
async function verifyRecaptcha(token: string | undefined) {
  const secret = process.env.RECAPTCHA_SECRET
  if (!secret) return { ok: true } // not configured -> skip

  if (!token) return { ok: false, message: 'captcha missing' }

  const params = new URLSearchParams()
  params.append('secret', secret)
  params.append('response', token)

  const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: params
  })
  const jb = await resp.json()
  // google 返回 success boolean and score (for v3)
  if (!jb.success) return { ok: false, message: 'captcha verification failed' }
  return { ok: true, score: jb.score }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const { storeName, ownerName, phone, email, captchaToken } = req.body || {}

  // basic input validation
  if (!storeName || typeof storeName !== 'string' || storeName.length > 200) {
    return res.status(400).json({ error: 'storeName invalid' })
  }
  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'email invalid' })
  }

  // 1) rate-limit: identify client by IP (X-Forwarded-For or socket)
  const forwarded = (req.headers['x-forwarded-for'] || '') as string
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown')

  const rlKey = `create-store:${ip}`
  const rl = await checkAndIncrRateLimit(rlKey, 'create-store', 20, 60 * 60) // limit: 20 requests/hour per IP
  if (!rl.allowed) {
    return res.status(429).json({ error: 'too many requests' })
  }

  // 2) optional captcha
  const captchaRes = await verifyRecaptcha(captchaToken)
  if (!captchaRes.ok) return res.status(400).json({ error: captchaRes.message || 'captcha failed' })

  const storeId = uuidv4()
  const start = new Date()
  const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000) // 3 days

  try {
    // 3) insert stores
    const { error: storeErr } = await supabaseAdmin
      .from('stores')
      .insert({
        id: storeId,
        name: storeName,
        owner_name: ownerName || null,
        email: email.toLowerCase().trim(),
        phone: phone || null,
        is_active: true,
        is_enabled: true,
        trial_start_at: start.toISOString(),
        trial_end_at: end.toISOString(),
      })

    if (storeErr) throw storeErr

    // 4) store_user_links
    const { error: linkErr } = await supabaseAdmin
      .from('store_user_links')
      .insert({ email: email.toLowerCase().trim(), store_id: storeId, created_at: new Date().toISOString() })
    if (linkErr) throw linkErr

    // 5) invite token
    const token = uuidv4().replace(/-/g, '') + Math.random().toString(36).slice(2, 8)
    const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()

    const { error: inviteErr } = await supabaseAdmin
      .from('invites')
      .insert({
        email: email.toLowerCase().trim(),
        store_id: storeId,
        token,
        expires_at,
      })
    if (inviteErr) throw inviteErr

    // 6) send mail
    const acceptUrl = `${NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/admin/accept-invite?token=${token}`
    const html = `
      <p>您好，您被邀請成為 <strong>${storeName}</strong> 的店家負責人。</p>
      <p>請點選下方連結設定帳號密碼並完成註冊（連結 ${expires_at} 過期）：</p>
      <p><a href="${acceptUrl}">${acceptUrl}</a></p>
      <p>若無法點擊，請複製上方連結到瀏覽器開啟。</p>
    `
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Olinex'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: `你被邀請加入 ${storeName}（請完成註冊）`,
      html,
    }
    await transporter.sendMail(mailOptions)

    // 7) log admin action (actor unknown for public endpoint; store IP)
    const meta = { ip, store_id: storeId, store_name: storeName, invite_sent_to: email }
    await supabaseAdmin.from('admin_logs').insert([{ action: 'create_store', actor_email: null, meta }])

    return res.status(200).json({
      success: true,
      store_id: storeId,
      trial_start_at: start.toISOString(),
      trial_end_at: end.toISOString(),
      invite_sent_to: email,
      rate_limit_remaining: rl.remaining ?? null,
    })
  } catch (err: any) {
    console.error('[create-store] error:', err)
    // log failure
    await supabaseAdmin.from('admin_logs').insert([{ action: 'create_store_failed', actor_email: null, meta: { ip, error: err?.message } }])
    return res.status(500).json({ error: err?.message || 'Server error' })
  }
}
