// pages/api/store/upsert-option.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabase = createServerSupabaseClient(req, res);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { id, store_id, name, input_type, values } = req.body as {
      id?: string | null;
      store_id?: string;
      name?: string;
      input_type?: 'single' | 'multi';
      values?: any;
    };

    if (!store_id || !name || !input_type || !Array.isArray(values)) {
      return res.status(400).json({ error: 'Bad Request: missing fields' });
    }

    const payload = {
      id: id || undefined,
      store_id,
      name,
      input_type,
      values,
    };

    const { data, error } = await supabaseAdmin
      .from('options')
      .upsert(payload, { onConflict: 'id' })
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
