// /utils/fetchItemOptions.ts
/* eslint-disable no-console */
import { supabase } from '@/lib/supabaseClient'

export type OptionValue = {
  label: string
  value: string
  price_delta?: number
}

export type OptionGroup = {
  id: string
  name: string
  input_type: 'single' | 'multi'
  values: OptionValue[]
  required?: boolean
}

/** 固定三組（不加價；是否必填可自行調整 required） */
function buildFixedGroups(): OptionGroup[] {
  return [
    {
      id: 'fixed_sweetness',
      name: '甜度',
      input_type: 'single',
      required: true,
      values: [
        { label: '無糖', value: '0', price_delta: 0 },
        { label: '微糖', value: '30', price_delta: 0 },
        { label: '半糖', value: '50', price_delta: 0 },
        { label: '全糖', value: '100', price_delta: 0 }
      ]
    },
    {
      id: 'fixed_ice',
      name: '冰塊',
      input_type: 'single',
      required: true,
      values: [
        { label: '去冰', value: '0', price_delta: 0 },
        { label: '微冰', value: '30', price_delta: 0 },
        { label: '正常冰', value: '100', price_delta: 0 }
      ]
    },
    {
      id: 'fixed_size',
      name: '容量',
      input_type: 'single',
      required: false, // 想改必填就設 true
      values: [
        { label: '中杯', value: 'M', price_delta: 0 },
        { label: '大杯', value: 'L', price_delta: 0 }
      ]
    }
  ]
}

/** 讀取 store 內「加料」選項（多選＋價差） */
async function getAddonsOption(storeId: string) {
  const { data, error } = await supabase
    .from('options')
    .select('id, name, input_type, values')
    .eq('store_id', storeId)
    .eq('name', '加料')
    .maybeSingle()

  if (error) {
    console.warn('[fetchItemOptions] getAddonsOption error:', error.message)
    return null
  }
  return (data ?? null) as { id: string; name: string; input_type: 'single' | 'multi'; values: OptionValue[] } | null
}

/** 判斷「加料」是否對此商品啟用：單品覆蓋 > 分類綁定 > 預設關閉 */
async function isEnabledForItem(optionId: string, categoryId: string, itemId: string): Promise<boolean> {
  // 單品覆蓋
  {
    const { data, error } = await supabase
      .from('item_options')
      .select('item_id')
      .eq('item_id', itemId)
      .eq('option_id', optionId)
      .limit(1)
    if (!error && data && data.length > 0) return true
  }
  // 分類綁定
  {
    const { data, error } = await supabase
      .from('category_options')
      .select('category_id')
      .eq('category_id', categoryId)
      .eq('option_id', optionId)
      .limit(1)
    if (!error && data && data.length > 0) return true
  }
  return false
}

/**
 * 規則（只管勾選）：
 *  - 後台「加料」對此商品未啟用（分類/單品都沒勾）→ 回傳 []（什麼都不顯示）
 *  - 啟用 → 顯示：固定三組（甜度/冰塊/容量，皆不加價）＋「加料（多選）」(若有值)
 */
export async function fetchItemOptions(menuItemId: string): Promise<OptionGroup[]> {
  // 1) 取商品（拿到 store_id / category_id）
  const { data: item, error: itemErr } = await supabase
    .from('menu_items')
    .select('id, store_id, category_id')
    .eq('id', menuItemId)
    .maybeSingle()

  if (itemErr || !item) {
    console.warn('[fetchItemOptions] menu item not found:', itemErr?.message || 'no item')
    return []
  }

  const storeId = (item as any).store_id as string
  const categoryId = (item as any).category_id as string

  // 2) 取得「加料」選項（若店家尚未建立，視為未啟用）
  const addonsOption = await getAddonsOption(storeId)
  if (!addonsOption || !addonsOption.id) return []

  // 3) 判斷是否啟用（分類或單品其一有勾）
  const enabled = await isEnabledForItem(addonsOption.id, categoryId, menuItemId)
  if (!enabled) return [] // ✅ 沒勾就完全不顯示任何選項

  // 4) 準備群組：固定三組
  const groups: OptionGroup[] = [...buildFixedGroups()]

  // 5) 附加「加料（多選）」群組（若有值）
  const addonValues: OptionValue[] = (addonsOption.values || []).map((v) => ({
    label: v.label,
    value: v.value,
    price_delta: typeof v.price_delta === 'number' ? v.price_delta : 0
  }))

  if (addonValues.length > 0) {
    groups.push({
      id: addonsOption.id,
      name: '加料',
      input_type: 'multi',
      required: false,
      values: addonValues
    })
  }

  return groups
}

export default fetchItemOptions
