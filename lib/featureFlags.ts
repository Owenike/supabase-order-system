// lib/featureFlags.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!ANON_KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');

// 前台用 anon client；讀取由 RLS 控制
const supabase = createClient(SUPABASE_URL, ANON_KEY);

export async function getDineInEnabled(storeId: string): Promise<boolean> {
  // 沒旗標 = 視為啟用（true）
  const { data, error } = await supabase
    .from('store_feature_flags')
    .select('enabled')
    .eq('store_id', storeId)
    .eq('feature_key', 'dine_in')
    .maybeSingle();

  if (error) {
    // 前台讀不到時，保守處理可選：回傳 true 或 false
    // 這裡採「保守關閉」也可，依你的商業邏輯調整
    return true;
  }
  return data ? !!data.enabled : true;
}
