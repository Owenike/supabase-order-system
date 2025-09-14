'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import ConfirmPasswordModal from '@/components/ui/ConfirmPasswordModal'

type AddonDB = { label: string; value: string; price_delta?: number }
type AddonUI = { label: string; price_delta?: number }

interface Category {
  id: string
  name: string
  created_at?: string
  store_id?: string
}

interface MenuItem {
  id: string
  name: string
  price: number
  description?: string
  category_id: string
  store_id: string
  is_available: boolean
  created_at?: string
}

// 依名稱自動產生穩定代碼（不讓店家手填）
function toCode(label: string): string {
  const base = (label ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
  return base || 'opt_' + Math.random().toString(36).slice(2, 8)
}

export default function StoreManagePage() {
  // ---- 基本狀態 ----
  const [storeId, setStoreId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [newMenu, setNewMenu] = useState<{ name: string; price: string; categoryId: string; description: string }>({
    name: '',
    price: '',
    categoryId: '',
    description: ''
  })
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingMenu, setEditingMenu] = useState<{ name: string; price: string; description: string }>({
    name: '',
    price: '',
    description: ''
  })

  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(true)
  const [err, setErr] = useState<string>('')

  // ---- 精簡核心：僅管理「加料」 ----
  const [addonsOptionId, setAddonsOptionId] = useState<string | null>(null)
  const [addons, setAddons] = useState<AddonUI[]>([{ label: '', price_delta: 0 }]) // ← UI 不再有 value

  // 綁定狀態（只針對「加料」這個 option）
  // 分類：cat_id -> enabled
  const [catAddonEnabled, setCatAddonEnabled] = useState<Record<string, boolean>>({})
  // 單品：item_id -> enabled（單品覆蓋）
  const [itemAddonEnabled, setItemAddonEnabled] = useState<Record<string, boolean>>({})

  const [filterCat, setFilterCat] = useState<string>('ALL')

  // ---- 初始化 ----
  useEffect(() => {
    const storedId = localStorage.getItem('store_id')
    if (!storedId) return
    setStoreId(storedId)
    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })
    void loadAll(storedId)
  }, [])

  const loadAll = useCallback(async (sid: string) => {
    setLoading(true)
    setErr('')
    try {
      await Promise.all([fetchCategories(sid), fetchMenus(sid)])
      const id = await ensureAddonsOption(sid) // 確保有「加料」這個 option（多選）
      setAddonsOptionId(id)
      await Promise.all([fetchAddonsValues(id), fetchCategoryAddonBindings(id), fetchItemAddonBindings(id)])
    } catch (e: any) {
      setErr(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  // ---- 既有資料載入（分類/菜單） ----
  const fetchCategories = async (sid: string) => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('fetchCategories error:', error)
      return
    }
    if (data) setCategories(data)
  }

  const fetchMenus = async (sid: string) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('fetchMenus error:', error)
      return
    }
    if (data) setMenus(data as MenuItem[])
  }

  // ---- 精簡：僅用一個「加料」選項（multi） ----
  const ensureAddonsOption = async (sid: string): Promise<string> => {
    // 1) 找是否已存在 name='加料' 的 option
    const { data: found, error: findErr } = await supabase
      .from('options')
      .select('id, name, input_type, values')
      .eq('store_id', sid)
      .eq('name', '加料')
      .limit(1)
      .maybeSingle()

    if (findErr) {
      console.error('ensureAddonsOption find error:', findErr.message)
    }
    if (found?.id) {
      return found.id as string
    }

    // 2) 沒有就建立
    const payload = {
      store_id: sid,
      name: '加料',
      input_type: 'multi',
      values: [] as AddonDB[]
    }
    const { data: ins, error: insErr } = await supabase.from('options').insert(payload).select('id').single()
    if (insErr || !ins?.id) {
      throw new Error(insErr?.message || '建立「加料」選項失敗')
    }
    return ins.id as string
  }

  const fetchAddonsValues = async (optionId: string) => {
    const { data, error } = await supabase.from('options').select('values').eq('id', optionId).maybeSingle()
    if (error) {
      console.error('fetchAddonsValues error:', error.message)
      return
    }
    const vals = (data?.values || []) as AddonDB[]
    if (vals.length === 0) {
      setAddons([{ label: '', price_delta: 0 }])
    } else {
      setAddons(vals.map((v) => ({ label: v.label || '', price_delta: Number(v.price_delta || 0) })))
    }
  }

  const upsertAddonsValues = async () => {
    if (!addonsOptionId) return
    // 過濾空白列，並自動產生 value
    const cleaned: AddonDB[] = addons
      .map((v) => ({
        label: (v.label || '').trim(),
        value: toCode((v.label || '').trim()), // ★ 自動產生穩定代碼
        price_delta: Number(v.price_delta || 0)
      }))
      .filter((v) => v.label)

    const { error } = await supabase.from('options').update({ values: cleaned }).eq('id', addonsOptionId)
    if (error) {
      alert('儲存失敗：' + error.message)
      return
    }
    alert('✅ 已儲存加料項目')
    await fetchAddonsValues(addonsOptionId)
  }

  // ---- 綁定（只處理「加料」這一個 option） ----
  const fetchCategoryAddonBindings = async (optionId: string) => {
    const { data, error } = await supabase
      .from('category_options')
      .select('category_id, option_id, required')
      .eq('option_id', optionId)
    if (error) {
      console.error('fetchCategoryAddonBindings error:', error.message)
      return
    }
    const map: Record<string, boolean> = {}
    ;(data || []).forEach((row: any) => {
      map[row.category_id] = true // 有記錄就視為啟用；加料不需要必填概念
    })
    setCatAddonEnabled(map)
  }

  const fetchItemAddonBindings = async (optionId: string) => {
    const { data, error } = await supabase
      .from('item_options')
      .select('item_id, option_id, required')
      .eq('option_id', optionId)
    if (error) {
      console.error('fetchItemAddonBindings error:', error.message)
      return
    }
    const map: Record<string, boolean> = {}
    ;(data || []).forEach((row: any) => {
      map[row.item_id] = true
    })
    setItemAddonEnabled(map)
  }

  const toggleCategoryAddon = async (categoryId: string, enabled: boolean) => {
    if (!addonsOptionId) return
    try {
      // 樂觀更新
      setCatAddonEnabled((prev) => ({ ...prev, [categoryId]: enabled }))
      const res = await fetch('/api/store/toggle-category-option', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          option_id: addonsOptionId,
          enabled,
          required: false // 加料不需要必填
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '更新失敗')
    } catch (e: any) {
      alert('分類加料設定失敗：' + (e?.message || 'Unknown error'))
      // 還原
      setCatAddonEnabled((prev) => ({ ...prev, [categoryId]: !enabled }))
    }
  }

  const toggleItemAddon = async (itemId: string, enabled: boolean) => {
    if (!addonsOptionId) return
    try {
      setItemAddonEnabled((prev) => ({ ...prev, [itemId]: enabled }))
      const res = await fetch('/api/store/toggle-item-option', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          option_id: addonsOptionId,
          enabled,
          required: false
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '更新失敗')
    } catch (e: any) {
      alert('單品加料設定失敗：' + (e?.message || 'Unknown error'))
      setItemAddonEnabled((prev) => ({ ...prev, [itemId]: !enabled }))
    }
  }

  // ---- 你原本的操作（分類/菜單 新增編輯刪除） ----
  const handleAddCategory = async () => {
    if (!newCategory.trim() || !storeId) return
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('store_id', storeId)
      .eq('name', newCategory)

    if (existing && existing.length > 0) {
      alert(`分類名稱「${newCategory}」已存在，請改用其他名稱`)
      return
    }

    await supabase.from('categories').insert({ name: newCategory, store_id: storeId })
    setNewCategory('')
    if (storeId) await fetchCategories(storeId)
  }

  const handleAddMenu = async () => {
    if (!newMenu.name || !newMenu.price || !newMenu.categoryId || !storeId) return
    const { data: existing } = await supabase
      .from('menu_items')
      .select('id')
      .eq('store_id', storeId)
      .eq('name', newMenu.name)

    if (existing && existing.length > 0) {
      alert(`菜單名稱「${newMenu.name}」已存在，請改用其他名稱`)
      return
    }

    await supabase.from('menu_items').insert({
      name: newMenu.name,
      price: Number(newMenu.price),
      description: newMenu.description,
      category_id: newMenu.categoryId,
      store_id: storeId,
      is_available: true
    })

    setNewMenu({ name: '', price: '', categoryId: '', description: '' })
    if (storeId) await fetchMenus(storeId)
  }

  const handleToggleAvailable = async (id: string, current: boolean) => {
    await supabase.from('menu_items').update({ is_available: !current }).eq('id', id)
    if (storeId) await fetchMenus(storeId)
  }

  const handleDeleteMenu = (id: string) => {
    setPendingDeleteId(id)
    setShowConfirmModal(true)
  }

  const handleDeleteCategory = (id: string) => {
    setPendingDeleteId(id)
    setShowConfirmModal(true)
  }

  const handleConfirmedDelete = async (password: string) => {
    if (!userEmail || !pendingDeleteId) return
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password
    })
    if (loginError) {
      alert('密碼錯誤，請再試一次')
      return
    }

    const { error: delMenuError } = await supabase.from('menu_items').delete().eq('id', pendingDeleteId)

    const { error: delCategoryError } = await supabase.from('categories').delete().eq('id', pendingDeleteId)

    if (delMenuError && delCategoryError) {
      alert('刪除失敗')
      return
    }

    alert('✅ 刪除成功')
    if (storeId) {
      await Promise.all([fetchMenus(storeId), fetchCategories(storeId)])
    }

    setPendingDeleteId(null)
    setShowConfirmModal(false)
  }

  const handleEditCategory = (id: string, name: string) => {
    setEditingCategoryId(id)
    setEditingCategoryName(name)
  }

  const handleSaveCategory = async (id: string) => {
    await supabase.from('categories').update({ name: editingCategoryName }).eq('id', id)
    setEditingCategoryId(null)
    if (storeId) await fetchCategories(storeId)
  }

  const handleEditMenu = (menu: MenuItem) => {
    setEditingMenuId(menu.id)
    setEditingMenu({
      name: menu.name,
      price: String(menu.price),
      description: menu.description || ''
    })
  }

  const handleSaveMenu = async (id: string) => {
    await supabase
      .from('menu_items')
      .update({
        name: editingMenu.name,
        price: Number(editingMenu.price),
        description: editingMenu.description
      })
      .eq('id', id)
    setEditingMenuId(null)
    if (storeId) await fetchMenus(storeId)
  }

  // ---- UI：加料管理（唯一要編輯的東西） ----
  const addAddonRow = () => setAddons((prev) => [...prev, { label: '', price_delta: 0 }])
  const removeAddonRow = (idx: number) => setAddons((prev) => prev.filter((_, i) => i !== idx))
  const updateAddonRow = (idx: number, key: keyof AddonUI, value: string) => {
    setAddons((prev) =>
      prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              [key]: key === 'price_delta' ? (Number(value || 0) as any) : (value as any)
            }
          : row
      )
    )
  }

  // ---- UI：渲染 ----
  const filteredItems = useMemo(() => {
    if (filterCat === 'ALL') return menus
    return menus.filter((i) => i.category_id === filterCat)
  }, [menus, filterCat])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🍽 店家後台管理（精簡版：只管理加料）</h1>

      {err && <div className="mb-3 rounded border bg-red-50 text-red-700 p-2">{err}</div>}
      {loading && <div className="mb-3">讀取中…</div>}

      {/* ---- 加料管理 ---- */}
      <section className="mb-8">
        <h2 className="font-semibold text-lg mb-2">加料管理（多選 / 含價差）</h2>
        <div className="rounded border p-3 mb-3">
          <p className="text-sm text-gray-600 mb-3">
            只要在這裡設定加料項目即可；<span className="font-medium">甜度 / 冰塊 / 容量</span> 由系統固定顯示，且不影響價格。
          </p>

          <div className="text-sm font-medium mb-1">加料項目</div>
          {addons.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
              <input
                className="border px-2 py-1 rounded"
                placeholder="顯示名稱（例：珍珠）"
                value={row.label}
                onChange={(e) => updateAddonRow(idx, 'label', e.target.value)}
              />
              <input
                type="number"
                className="border px-2 py-1 rounded"
                placeholder="價差（例：10）"
                value={String(row.price_delta ?? 0)}
                onChange={(e) => updateAddonRow(idx, 'price_delta', e.target.value)}
              />
              <div className="flex items-center">
                <button className="text-sm text-red-600" onClick={() => removeAddonRow(idx)}>
                  刪除此列
                </button>
              </div>
            </div>
          ))}
          <button className="text-sm bg-gray-100 px-2 py-1 rounded mr-2" onClick={addAddonRow}>
            + 新增一列
          </button>
          <button
            className="text-sm bg-green-600 text-white px-3 py-1 rounded"
            onClick={upsertAddonsValues}
            disabled={!addonsOptionId}
          >
            儲存加料
          </button>
        </div>
      </section>

      {/* ---- 分類層級：啟用/停用「加料」 ---- */}
      <section className="mb-8">
        <h2 className="font-semibold text-lg mb-2">分類：加料開關</h2>
        <div className="rounded border overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left w-48">分類</th>
                <th className="p-2 text-left">是否啟用「加料」</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-t">
                  <td className="p-2 font-medium">{cat.name}</td>
                  <td className="p-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!catAddonEnabled[cat.id]}
                        onChange={(e) => toggleCategoryAddon(cat.id, e.target.checked)}
                        disabled={!addonsOptionId}
                      />
                      <span>啟用加料</span>
                    </label>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td className="p-2" colSpan={2}>
                    尚無分類
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- 單品覆蓋（特例） ---- */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">單品覆蓋（特例：個別開關加料）</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm">分類篩選</label>
            <select className="border px-2 py-1 rounded" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option value="ALL">全部</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded border overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left w-64">品名</th>
                <th className="p-2 text-left">是否啟用「加料」</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">NT$ {item.price}</div>
                  </td>
                  <td className="p-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!itemAddonEnabled[item.id]}
                        onChange={(e) => toggleItemAddon(item.id, e.target.checked)}
                        disabled={!addonsOptionId}
                      />
                      <span>啟用加料（覆蓋分類設定）</span>
                    </label>
                    <div className="text-xs text-gray-500 mt-1">※ 單品設定會覆蓋分類預設；未勾時，依分類設定為準。</div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td className="p-2" colSpan={2}>
                    此分類尚無商品
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- 你原本的新增/列表區（保留） ---- */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">新增分類</h2>
        <div className="flex gap-2">
          <input
            type="text"
            className="border px-3 py-2 rounded w-full"
            placeholder="分類名稱"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button onClick={handleAddCategory} className="bg-blue-600 text-white px-4 rounded">
            新增
          </button>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="font-semibold mb-2">新增菜單</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            type="text"
            className="border px-3 py-2 rounded"
            placeholder="菜名"
            value={newMenu.name}
            onChange={(e) => setNewMenu({ ...newMenu, name: e.target.value })}
          />
          <input
            type="number"
            className="border px-3 py-2 rounded"
            placeholder="價格"
            value={newMenu.price}
            onChange={(e) => setNewMenu({ ...newMenu, price: e.target.value })}
          />
          <input
            type="text"
            className="border px-3 py-2 rounded"
            placeholder="描述（選填）"
            value={newMenu.description}
            onChange={(e) => setNewMenu({ ...newMenu, description: e.target.value })}
          />
          <select
            className="border px-3 py-2 rounded"
            value={newMenu.categoryId}
            onChange={(e) => setNewMenu({ ...newMenu, categoryId: e.target.value })}
          >
            <option value="">選擇分類</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <button onClick={handleAddMenu} className="mt-2 bg-green-600 text-white px-4 py-2 rounded">
          新增菜單
        </button>
      </div>

      <div>
        <h2 className="font-semibold mb-2">現有分類與菜單</h2>
        {categories.map((cat) => (
          <div key={cat.id} className="mb-4 border-b pb-2">
            <div className="flex justify-between items-center mb-1">
              {editingCategoryId === cat.id ? (
                <div className="flex gap-2 items-center w-full">
                  <input
                    className="border px-2 py-1 rounded w-full"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                  />
                  <button onClick={() => handleSaveCategory(cat.id)} className="text-sm text-white bg-green-600 px-2 py-1 rounded">
                    儲存
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold">{cat.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditCategory(cat.id, cat.name)} className="text-sm text-blue-600">
                      編輯
                    </button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="text-sm text-red-600">
                      刪除
                    </button>
                  </div>
                </>
              )}
            </div>

            <ul className="pl-4 list-disc text-sm space-y-1">
              {menus
                .filter((menu) => menu.category_id === cat.id)
                .map((menu) => (
                  <li key={menu.id}>
                    {editingMenuId === menu.id ? (
                      <div className="flex flex-col w-full gap-1">
                        <input
                          className="border px-2 py-1 rounded"
                          value={editingMenu.name}
                          onChange={(e) => setEditingMenu({ ...editingMenu, name: e.target.value })}
                        />
                        <input
                          className="border px-2 py-1 rounded"
                          value={editingMenu.price}
                          onChange={(e) => setEditingMenu({ ...editingMenu, price: e.target.value })}
                        />
                        <input
                          className="border px-2 py-1 rounded"
                          value={editingMenu.description}
                          onChange={(e) => setEditingMenu({ ...editingMenu, description: e.target.value })}
                        />
                        <button onClick={() => handleSaveMenu(menu.id)} className="text-sm bg-green-600 text-white px-2 py-1 rounded mt-1 self-end">
                          儲存
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          🍴 {menu.name} (${menu.price}) {menu.description && `- ${menu.description}`}
                          <span className={`ml-2 text-xs ${menu.is_available ? 'text-green-600' : 'text-red-600'}`}>
                            {menu.is_available ? '販售中' : '停售中'}
                          </span>
                        </div>
                        <div className="flex gap-2 items-center">
                          <button onClick={() => handleEditMenu(menu)} className="text-sm text-blue-600">
                            編輯
                          </button>
                          <button
                            onClick={() => handleToggleAvailable(menu.id, menu.is_available)}
                            className="text-sm bg-yellow-500 text-white px-2 py-1 rounded"
                          >
                            {menu.is_available ? '停售' : '上架'}
                          </button>
                          <button onClick={() => handleDeleteMenu(menu.id)} className="text-sm text-red-600">
                            刪除
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {showConfirmModal && (
        <ConfirmPasswordModal
          onCancel={() => {
            setShowConfirmModal(false)
            setPendingDeleteId(null)
          }}
          onConfirm={handleConfirmedDelete}
        />
      )}
    </div>
  )
}
