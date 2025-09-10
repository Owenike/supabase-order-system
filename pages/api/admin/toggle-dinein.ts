// pages/api/admin/toggle-dinein.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1) 從 Authorization header 取出 access_token
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // 2) 用 token 取得當前使用者資料（不靠 cookies）
    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = userRes.user;
    if (user.user_metadata?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }

    // 3) 參數
    const { store_id } = req.body as { store_id?: string };
    if (!store_id) return res.status(400).json({ error: 'Missing store_id' });

    // 4) 讀取現況
    const { data: existing, error: getErr } = await supabaseAdmin
      .from('store_feature_flags')
      .select('id, enabled')
      .eq('store_id', store_id)
      .eq('feature_key', 'dine_in')
      .maybeSingle();
    if (getErr) return res.status(500).json({ error: getErr.message });

    const nextEnabled = existing ? !existing.enabled : false; // 第一次點→封鎖(false)

    // 5) UPSERT 反轉
    const { error: upsertErr } = await supabaseAdmin
      .from('store_feature_flags')
      .upsert(
        {
          store_id,
          feature_key: 'dine_in',
          enabled: nextEnabled,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: 'store_id,feature_key' }
      );
    if (upsertErr) return res.status(500).json({ error: upsertErr.message });

    return res.status(200).json({ store_id, dine_in_enabled: nextEnabled });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
