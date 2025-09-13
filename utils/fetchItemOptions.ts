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

/** 依分類名稱判斷是否為飲料類（關鍵字可自行擴充） */
function isDrinkCategoryName(name?: string | null): boolean {
  if (!name) return false
  const s = String(name).toLowerCase()
  const keywords = [
    // 中文常見
    '飲料', '飲品', '手搖', '茶', '奶茶', '果茶', '咖啡', '可可', '果汁', '冰沙', '氣泡飲', '冷飲', '熱飲',
    // 英文常見
    'drink', 'drinks', 'beverage', 'beverages', 'coffee', 'tea', 'smoothie', 'juice', 'sparkling'
  ]
  return keywords.some(k => s.includes(k))
}

/** 固定的三大選項（僅飲料使用；不加價） */
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
    required: false, // 要改成必填就設 true
    values: [
      { label: '中杯', value: 'M', price_delta: 0 },
      { label: '大杯', value: 'L', price_delta: 0 }
    ]
  }

  return [sweetness, ice, size]
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

    if (!error && data && data.length > 0) return true
  }

  // 2) 分類綁定
  {
    const { data, error } = await supabase
      .from('category_options')
      .select('category_id')
      .eq('category_id', categoryId)
      .eq('option_id', optionId)
      .limit(1)

    if (!error && data && data.length > 0) return true
  }

  // 3) 預設關閉
  return false
}

/**
 * 依據商品 id 回傳要給前端選擇的「選項群組」
 * 規則（符合「有勾選才出現」）：
 *  - 若「加料」未啟用（分類/單品都沒勾），直接回傳 []（什麼都不顯示）
 *  - 若啟用：
 *      * 若分類為飲料 → 先附加 固定三組（甜度/冰塊/容量，皆不加價）
 *      * 再附加「加料（多選）」並帶 DB 內的價差
 */
export async function fetchItemOptions(menuItemId: string): Promise<OptionGroup[]> {
  // 1) 取商品，拿到 store_id / category_id
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

  // 2) 取得「加料」選項（若店家尚未建立，當作未啟用）
  const addonsOption = await getAddonsOption(storeId)
  if (!addonsOption || !addonsOption.id) {
    return [] // 沒有「加料」這個選項 → 視為未啟用 → 什麼都不顯示
  }

  // 3) 判斷此商品是否「啟用加料」（分類或單品有勾）
  const enabled = await isAddonsEnabledForItem(addonsOption.id, categoryId, menuItemId)
  if (!enabled) {
    return [] // ✅ 關鍵：沒勾就什麼都不顯示（包含甜度/冰塊/容量）
  }

  // 4) 準備回傳群組
  const groups: OptionGroup[] = []

  // 4-1) 若分類是飲料，附加固定三組（不加價）
  // 需要知道分類名稱
  const { data: catRow } = await supabase
    .from('categories')
    .select('name')
    .eq('id', categoryId)
    .maybeSingle()

  if (isDrinkCategoryName(catRow?.name)) {
    groups.push(...buildFixedDrinkGroups())
  }

  // 4-2) 附加「加料（多選）」群組（若有值）
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
