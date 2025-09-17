// pages/api/orders/create.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type OptionsMap = Record<string, string | string[]>
type ItemIn = { name: string; quantity: number; price: number; options?: OptionsMap | null }
type ItemOut = { name: string; quantity: number; price: number; options?: OptionsMap | null }

function setCors(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_SITE_ORIGIN || '')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sanitizeOptions(input: any): OptionsMap | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out: OptionsMap = {}
  for (const key of Object.keys(input)) {
    const v = (input as Record<string, unknown>)[key]
    if (Array.isArray(v)) {
      const arr = v
        .map((x) => (x == null ? '' : String(x)))
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      if (arr.length > 0) out[key] = arr
    } else {
      const s = String(v ?? '').trim()
      if (s) out[key] = s
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 允許 OPTIONS 預檢
  if (req.method === 'OPTIONS') {
    setCors(res)
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(200).json({ ok: true })
  }
  if (req.method !== 'POST') {
    setCors(res)
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const {
      store_id,
      table_number,
      items,
      note,
      status = 'pending',
      total,
      line_user_id = null,
      spicy_level = null,
    } = req.body || {}

    setCors(res)

    if (!store_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Bad Request: store_id / items required' })
    }

    // 判斷是否為外帶（支援三種常見寫法）
    const tableRaw = table_number == null ? '' : String(table_number)
    const tableLower = tableRaw.toLowerCase()
    const isTakeout =
      tableLower === 'takeout' || tableRaw === '0' || tableRaw === '外帶'

    // ★ 僅外帶強制要求 line_user_id（維持外帶需要 LINE 的策略）
    if (isTakeout && !line_user_id) {
      return res.status(400).json({ error: 'LINE is required for takeout orders' })
    }

    // 清洗 items（包含 options）
    const cleanedItems: ItemOut[] = (items as ItemIn[])
      .map((i) => {
        const name = String(i?.name || '').trim()
        const quantity = Math.max(0, parseInt(String(i?.quantity || 0), 10) || 0)
        const price = Math.max(0, Number(i?.price || 0) || 0)
        const options = sanitizeOptions(i?.options)
        const base: ItemOut = { name, quantity, price }
        return options ? { ...base, options } : base
      })
      .filter((i) => i.name && i.quantity > 0)

    if (cleanedItems.length === 0) {
      return res.status(400).json({ error: 'Bad Request: items empty after cleaning' })
    }

    const calcTotal =
      typeof total === 'number'
        ? total
        : cleanedItems.reduce((s, it) => s + it.price * it.quantity, 0)

    // 僅允許 'completed' 直接成單，其他一律轉換為 'pending'
    const normalizedStatus = status === 'completed' ? 'completed' : 'pending'

    const payload: Record<string, any> = {
      store_id,
      table_number: tableRaw || null,
      items: cleanedItems, // JSONB 欄位
      note: note?.toString().trim() || null,
      status: normalizedStatus,
      total: calcTotal,
      line_user_id: line_user_id || null, // 內用可為 null；外帶已於上方檢查
      spicy_level: spicy_level || null,
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      console.error('[API][orders/create] insert error:', error, 'payload=', payload)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ ok: true, id: data?.id })
  } catch (e: any) {
    console.error('[API][orders/create] exception:', e)
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
