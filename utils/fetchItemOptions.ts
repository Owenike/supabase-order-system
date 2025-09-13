import { supabase } from '@/lib/supabaseClient';

export type OptionValue = { label: string; value: string; price_delta?: number };
export type OptionGroup = {
  id: string;
  name: string;
  input_type: 'single' | 'multi';
  required: boolean;
  values: OptionValue[];
};

export async function fetchItemOptions(itemId: string): Promise<OptionGroup[]> {
  const { data, error } = await supabase.rpc('get_item_options', { p_item_id: itemId });
  if (error) throw error;
  return (data ?? []) as OptionGroup[];
}
