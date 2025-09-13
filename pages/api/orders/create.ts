// pages/api/orders/create.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Item = { name: string; quantity: number; price: number }

function setCors(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_SITE_ORIGIN || '')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
      // display_name 被拿掉
    } = req.body || {}

    setCors(res)

    if (!store_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Bad Request: store_id / items required' })
    }

    // 清洗 items
    const cleanedItems: Item[] = (items as any[])
      .map((i) => ({
        name: String(i?.name || '').trim(),
        quantity: Math.max(0, parseInt(String(i?.quantity || 0), 10) || 0),
        price: Math.max(0, Number(i?.price || 0) || 0),
      }))
      .filter((i) => i.name && i.quantity > 0)

    if (cleanedItems.length === 0) {
      return res.status(400).json({ error: 'Bad Request: items empty after cleaning' })
    }

    const calcTotal =
      typeof total === 'number'
        ? total
        : cleanedItems.reduce((s, it) => s + it.price * it.quantity, 0)

    const payload: any = {
      store_id,
      table_number: table_number || null,
      items: cleanedItems,
      note: note?.toString().trim() || null,
      status: status === 'completed' ? 'completed' : 'pending',
      total: calcTotal,
      line_user_id,
      spicy_level,
      // display_name:  ✗ 移除
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
