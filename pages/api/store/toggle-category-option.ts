// pages/api/store/toggle-category-option.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // 驗證登入（用使用者 session）
    const supabase = createServerSupabaseClient(req, res);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { category_id, option_id, enabled, required } = req.body as {
      category_id?: string;
      option_id?: string;
      enabled?: boolean;
      required?: boolean;
    };

    if (!category_id || !option_id || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Bad Request: category_id, option_id, enabled are required' });
    }

    // 開/關：有開 → upsert；關閉 → delete
    if (enabled) {
      // 假設資料表有唯一鍵 (category_id, option_id)
      const { error } = await supabaseAdmin
        .from('category_options')
        .upsert(
          { category_id, option_id, required: !!required },
          { onConflict: 'category_id,option_id' }
        );
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, enabled: true });
    } else {
      const { error } = await supabaseAdmin
        .from('category_options')
        .delete()
        .eq('category_id', category_id)
        .eq('option_id', option_id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, enabled: false });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
