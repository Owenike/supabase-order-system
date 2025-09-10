// pages/api/admin/toggle-dinein.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabaseServer'; // ← 改用你自己的 SSR 包裝器

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1) 從 Cookie 驗證目前使用者必須是 admin
    const supabase = createServerSupabaseClient(req, res);
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();

    if (sessionErr || !session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session.user.user_metadata?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }

    // 2) 參數檢查
    const { store_id } = req.body as { store_id?: string };
    if (!store_id) {
      return res.status(400).json({ error: 'Missing store_id' });
    }

    // 3) 讀取現況
    const { data: existing, error: getErr } = await supabaseAdmin
      .from('store_feature_flags')
      .select('id, enabled')
      .eq('store_id', store_id)
      .eq('feature_key', 'dine_in')
      .maybeSingle();

    if (getErr) {
      return res.status(500).json({ error: getErr.message });
    }

    const nextEnabled = existing ? !existing.enabled : false; // 第一次點 = 封鎖(false)

    // 4) 反轉/建立旗標（UPSERT）
    const { error: upsertErr } = await supabaseAdmin
      .from('store_feature_flags')
      .upsert(
        {
          store_id,
          feature_key: 'dine_in',
          enabled: nextEnabled,
          updated_at: new Date().toISOString(),
          updated_by: session.user.id,
        },
        { onConflict: 'store_id,feature_key' }
      );

    if (upsertErr) {
      return res.status(500).json({ error: upsertErr.message });
    }

    return res.status(200).json({ store_id, dine_in_enabled: nextEnabled });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
