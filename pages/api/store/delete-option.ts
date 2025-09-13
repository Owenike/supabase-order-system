// pages/api/store/delete-option.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabase = createServerSupabaseClient(req, res);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.body as { id?: string };
    if (!id) return res.status(400).json({ error: 'Bad Request: id required' });

    const { error } = await supabaseAdmin.from('options').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
