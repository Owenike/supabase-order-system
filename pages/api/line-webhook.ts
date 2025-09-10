// /pages/api/line-webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { Client } from '@line/bot-sdk'
import crypto from 'crypto'

// 必須關閉 bodyParser：保留 raw body 來驗簽
export const config = {
  api: { bodyParser: false }
}

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || ''
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''

// 只需 access token 即可回覆訊息
const client = new Client({ channelAccessToken: CHANNEL_ACCESS_TOKEN })

/** 讀 raw body（用於簽名計算） */
function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** 驗證 X-Line-Signature（使用常數時間比較） */
function validateSignature(rawBody: Buffer, signatureB64: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody)
  const expectedB64 = hmac.digest('base64')
  // 使用 Buffer 與 timingSafeEqual 避免時序資訊外洩
  const sig = Buffer.from(signatureB64, 'base64')
  const exp = Buffer.from(expectedB64, 'base64')
  if (sig.length !== exp.length) return false
  return crypto.timingSafeEqual(sig, exp)
}

type LineEvent = {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type: string; text?: string }
}

/** 單一事件處理（非阻塞） */
async function handleEvent(ev: LineEvent) {
  if (ev.type === 'message' && ev.message?.type === 'text' && ev.replyToken) {
    const text = (ev.message.text || '').trim()
    if (!text) return
    await client.replyMessage(ev.replyToken, [
      { type: 'text', text: `你說了：「${text}」` },
    ])
    return
  }

  if (ev.type === 'follow' && ev.replyToken) {
    await client.replyMessage(ev.replyToken, [
      { type: 'text', text: '感謝加入好友！有需要可直接輸入文字給我～' },
    ])
    return
  }

  // 其他事件先忽略（postback、beacon、unfollow…）
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 健康檢查/驗證
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).send('ok')
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET, HEAD')
    return res.status(405).end('Method Not Allowed')
  }

  try {
    if (!CHANNEL_SECRET || !CHANNEL_ACCESS_TOKEN) {
      console.error('[LINE] Missing env: secret or access token')
      return res.status(500).end('Missing LINE env')
    }

    const rawBody = await readRawBody(req)
    const signature = (req.headers['x-line-signature'] as string) || ''

    // 簽名必須存在（提高安全性）
    if (!signature) {
      return res.status(403).end('Missing signature')
    }

    if (!validateSignature(rawBody, signature, CHANNEL_SECRET)) {
      console.error('[LINE] Invalid signature')
      return res.status(403).end('Invalid signature')
    }

    // 解析 JSON（加上防呆）
    let body: { events: LineEvent[] }
    try {
      body = JSON.parse(rawBody.toString('utf-8'))
    } catch (e) {
      console.error('[LINE] JSON parse error:', e)
      return res.status(400).end('Invalid JSON')
    }

    // 先回 200，避免 LINE 判定逾時
    res.status(200).end()

    // 並行處理事件（非阻塞）
    const tasks = (body.events || []).map((ev) =>
      handleEvent(ev).catch((err) => {
        console.error('[LINE] handle event error:', err)
      })
    )
    await Promise.allSettled(tasks)
  } catch (err) {
    console.error('[LINE] webhook error:', err)
    return res.status(400).end('Bad request')
  }
}
