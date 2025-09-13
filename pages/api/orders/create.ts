// pages/api/orders/create.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// 可視需要打開：確保跑在 Node runtime（非 Edge）
// export const config = { runtime: 'nodejs' }

type Item = { name: string; quantity: number; price: number }

function ok(res: NextApiResponse, data: any) {
  // 同網域其實不需要 CORS，但允許 OPTIONS 時順手加上
  res.setHeader('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_SITE_ORIGIN || '')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  return res.status(200).json(data)
}
function err(res: NextApiResponse, code: number, message: string) {
  res.setHeader('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_SITE_ORIGIN || '')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  return res.status(code).json({ error: message })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1) 允許 OPTIONS 預檢，避免 405
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return ok(res, { ok: true })
  }

  // 2) 僅接受 POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return err(res, 405, 'Method Not Allowed')
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
      display_name = null,
    } = req.body || {}

    if (!store_id || !Array.isArray(items) || items.length === 0) {
      return err(res, 400, 'Bad Request: store_id / items required')
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
      return err(res, 400, 'Bad Request: items empty after cleaning')
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
      display_name,
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      // 將資料寫到 console，方便在 Vercel Logs 看到
      console.error('[API][orders/create] insert error:', error, 'payload=', payload)
      return err(res, 500, error.message)
    }

    return ok(res, { ok: true, id: data?.id })
  } catch (e: any) {
    console.error('[API][orders/create] exception:', e)
    return err(res, 500, e?.message || 'Unexpected error')
  }
}
