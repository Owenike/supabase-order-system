// pages/api/admin/stores-with-flags.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type Store = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

type StoreWithFlag = Store & {
  dine_in_enabled: boolean; // 預設 true（未建旗標時）
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 讀 stores
    const { data: stores, error: storesErr } = await supabaseAdmin
      .from('stores')
      .select('id, name, email, phone')
      .order('name', { ascending: true });

    if (storesErr) {
      return res.status(500).json({ error: storesErr.message });
    }

    const storeIds = (stores ?? []).map((s) => s.id);
    let flagsMap = new Map<string, boolean>();

    if (storeIds.length > 0) {
      const { data: flags, error: flagsErr } = await supabaseAdmin
        .from('store_feature_flags')
        .select('store_id, feature_key, enabled')
        .in('store_id', storeIds)
        .eq('feature_key', 'dine_in');

      if (flagsErr) {
        return res.status(500).json({ error: flagsErr.message });
      }

      for (const f of flags ?? []) {
        flagsMap.set(f.store_id as string, !!f.enabled);
      }
    }

    const rows: StoreWithFlag[] = (stores ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email ?? null,
      phone: s.phone ?? null,
      dine_in_enabled: flagsMap.has(s.id) ? !!flagsMap.get(s.id) : true, // 沒旗標視為啟用
    }));

    return res.status(200).json({ rows });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
