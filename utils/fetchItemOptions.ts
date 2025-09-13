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
  /** 是否為必填（前端會據此要求使用者選擇） */
  required?: boolean
}

/**
 * 固定出現的三大選項（不加價）：
 * 1) 甜度（必填 / 單選）
 * 2) 冰塊（必填 / 單選）
 * 3) 容量（非必填 / 單選）→ 你要改成必填也可以把 required 設成 true
 */
function buildFixedDrinkGroups(): OptionGroup[] {
  const sweetness: OptionGroup = {
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
  }

  const ice: OptionGroup = {
    id: 'fixed_ice',
    name: '冰塊',
    input_type: 'single',
    required: true,
    values: [
      { label: '去冰', value: '0', price_delta: 0 },
      { label: '微冰', value: '30', price_delta: 0 },
      { label: '正常冰', value: '100', price_delta: 0 }
    ]
  }

  const size: OptionGroup = {
    id: 'fixed_size',
    name: '容量',
    input_type: 'single',
    required: false, // 想改成必填就設 true
    values: [
      { label: '中杯', value: 'M', price_delta: 0 },
      { label: '大杯', value: 'L', price_delta: 0 }
    ]
  }

  return [sweetness, ice, size]
}

/**
 * 取得單一選項（加料）的全量值
 */
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
  // 若沒有「加料」這個選項，表示店家尚未建立，前端就忽略即可
  return data as { id: string; name: string; input_type: 'single' | 'multi'; values: OptionValue[] } | null
}

/**
 * 判斷「加料」是否對此商品啟用：
 * 優先順序：單品覆蓋(item_options) > 分類綁定(category_options) > 預設關閉
 * - 只要資料表有一筆對應關係，就視為啟用（此專案設計沒有 enabled 欄位）
 */
async function isAddonsEnabledForItem(
  optionId: string,
  categoryId: string,
  itemId: string
): Promise<boolean> {
  // 1) 單品覆蓋
  {
    const { data, error } = await supabase
      .from('item_options')
      .select('item_id')
      .eq('item_id', itemId)
      .eq('option_id', optionId)
      .limit(1)

    if (!error && data && data.length > 0) {
      return true
    }
  }

  // 2) 分類綁定
  {
    const { data, error } = await supabase
      .from('category_options')
      .select('category_id')
      .eq('category_id', categoryId)
      .eq('option_id', optionId)
      .limit(1)

    if (!error && data && data.length > 0) {
      return true
    }
  }

  // 3) 預設關閉
  return false
}

/**
 * 依據商品 id 回傳要給前端選擇的「選項群組」
 * - 固定包含：甜度 / 冰塊 / 容量（皆不加價）
 * - 若「加料」對此商品啟用，則追加「加料（多選，含價差）」群組
 */
export async function fetchItemOptions(menuItemId: string): Promise<OptionGroup[]> {
  // 先取商品以拿到 store_id、category_id
  const { data: item, error: itemErr } = await supabase
    .from('menu_items')
    .select('id, store_id, category_id')
    .eq('id', menuItemId)
    .maybeSingle()

  if (itemErr || !item) {
    console.warn('[fetchItemOptions] menu item not found:', itemErr?.message || 'no item')
    // 找不到商品就只回傳固定三個，避免整個流程中斷
    return buildFixedDrinkGroups()
  }

  const { store_id: storeId, category_id: categoryId } = item as {
    store_id: string
    category_id: string
  }

  // 固定三個群組（不加價）
  const groups: OptionGroup[] = buildFixedDrinkGroups()

  // 取得「加料」選項（若店家尚未建立，直接省略）
  const addonsOption = await getAddonsOption(storeId)
  if (!addonsOption || !addonsOption.id) {
    return groups
  }

  // 判斷此商品是否啟用「加料」
  const enabled = await isAddonsEnabledForItem(addonsOption.id, categoryId, menuItemId)
  if (!enabled) {
    return groups
  }

  // 有啟用：把「加料（多選）」附加上去（帶 DB 的價差）
  const addonValues: OptionValue[] = (addonsOption.values || []).map((v) => ({
    label: v.label,
    value: v.value,
    price_delta: typeof v.price_delta === 'number' ? v.price_delta : 0
  }))

  // 若店家還沒填任何加料項目，就不顯示加料群組
  if (addonValues.length === 0) {
    return groups
  }

  const addonsGroup: OptionGroup = {
    id: addonsOption.id,
    name: '加料',
    input_type: 'multi',
    required: false,
    values: addonValues
  }

  groups.push(addonsGroup)
  return groups
}

export default fetchItemOptions
