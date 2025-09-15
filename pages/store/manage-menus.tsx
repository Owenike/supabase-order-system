'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import ConfirmPasswordModal from '@/components/ui/ConfirmPasswordModal'

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

export default function StoreManageMenusPage() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [menus, setMenus] = useState<MenuItem[]>([])

  // 新增用
  const [newCategory, setNewCategory] = useState('')
  const [newMenu, setNewMenu] = useState<{
    name: string
    price: string
    categoryId: string
    description: string
  }>({
    name: '',
    price: '',
    categoryId: '',
    description: ''
  })

  // 編輯用
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingMenu, setEditingMenu] = useState<{ name: string; price: string; description: string }>({
    name: '',
    price: '',
    description: ''
  })

  // 刪除保護
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(true)
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    const storedId = typeof window !== 'undefined' ? localStorage.getItem('store_id') : null
    if (!storedId) return
    setStoreId(storedId)

    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })

    void loadAll(storedId)
  }, [])

  const loadAll = async (sid: string) => {
    setLoading(true)
    setErr('')
    try {
      await Promise.all([fetchCategories(sid), fetchMenus(sid)])
    } catch (e: any) {
      setErr(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

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
    if (data) setCategories(data as Category[])
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

  // ==== 新增 ====
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

    await supabase.from('categories').insert({ name: newCategory.trim(), store_id: storeId })
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
      name: newMenu.name.trim(),
      price: Number(newMenu.price),
      description: newMenu.description.trim(),
      category_id: newMenu.categoryId,
      store_id: storeId,
      is_available: true
    })

    setNewMenu({ name: '', price: '', categoryId: '', description: '' })
    if (storeId) await fetchMenus(storeId)
  }

  // ==== 上下架 ====
  const handleToggleAvailable = async (id: string, current: boolean) => {
    await supabase.from('menu_items').update({ is_available: !current }).eq('id', id)
    if (storeId) await fetchMenus(storeId)
  }

  // ==== 刪除 ====
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
    if (storeId) await Promise.all([fetchMenus(storeId), fetchCategories(storeId)])

    setPendingDeleteId(null)
    setShowConfirmModal(false)
  }

  // ==== 編輯 ====
  const handleEditCategory = (id: string, name: string) => {
    setEditingCategoryId(id)
    setEditingCategoryName(name)
  }

  const handleSaveCategory = async (id: string) => {
    await supabase.from('categories').update({ name: editingCategoryName.trim() }).eq('id', id)
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
        name: editingMenu.name.trim(),
        price: Number(editingMenu.price),
        description: editingMenu.description.trim()
      })
      .eq('id', id)
    setEditingMenuId(null)
    if (storeId) await fetchMenus(storeId)
  }

  const handleRefresh = () => {
    if (storeId) void loadAll(storeId)
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      {/* 頁首 */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">📋</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">分類與菜單管理</h1>
            <p className="text-white/70 text-sm mt-1">快速新增分類、餐點與上下架</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex h-9 px-3 items-center rounded-md bg-white/10 text-white hover:bg-white/15 border border-white/15"
          >
            重新整理
          </button>
        </div>
      </div>

      {/* 膠囊導覽 */}
      <div className="mb-6">
        <div className="inline-flex overflow-hidden rounded-full shadow ring-1 ring-black/10">
          <Link
            href="/store/manage-addons"
            className="px-6 py-2 bg-white/10 text-white hover:bg-white/20 backdrop-blur transition"
          >
            加料管理
          </Link>
          <Link
            href="/store/manage-menus"
            className="px-6 py-2 bg-yellow-400 text-black font-semibold"
          >
            新增分類與菜單
          </Link>
        </div>
      </div>

      {/* 錯誤 / 載入 */}
      {err && <div className="mb-4 rounded border border-red-300 bg-red-50 text-red-700 p-3">❌ {err}</div>}
      {loading && <div className="mb-4 text-white/80">讀取中…</div>}

      {/* ---- 新增分類 ---- */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 mb-6">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold">新增分類</h2>
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              className="border px-3 py-2 rounded w-full"
              placeholder="分類名稱"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button
              onClick={handleAddCategory}
              className="px-4 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              新增
            </button>
          </div>
        </div>
      </div>

      {/* ---- 新增菜單 ---- */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 mb-6">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold">新增菜單</h2>
        </div>
        <div className="p-4">
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
          <button
            onClick={handleAddMenu}
            className="mt-3 px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            新增菜單
          </button>
        </div>
      </div>

      {/* ---- 現有分類與菜單清單 ---- */}
      <div className="space-y-4">
        <h2 className="text-white font-semibold">現有分類與菜單</h2>

        {categories.length === 0 && !loading && (
          <div className="bg-white text-gray-900 rounded-lg border shadow p-4">
            <p className="text-gray-600">目前尚無分類，請先於上方新增分類。</p>
          </div>
        )}

        {categories.map((cat) => (
          <div key={cat.id} className="bg-white text-gray-900 rounded-lg shadow border border-gray-200">
            {/* 分類列 */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              {editingCategoryId === cat.id ? (
                <div className="flex gap-2 items-center w-full">
                  <input
                    className="border px-2 py-1 rounded w-full"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                  />
                  <button
                    onClick={() => handleSaveCategory(cat.id)}
                    className="text-sm px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    儲存
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold">{cat.name}</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditCategory(cat.id, cat.name)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      刪除
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 該分類的菜單列表 */}
            <ul className="p-4 space-y-2">
              {menus.filter((m) => m.category_id === cat.id).length === 0 && (
                <li className="text-sm text-gray-500">此分類尚無菜單。</li>
              )}

              {menus
                .filter((menu) => menu.category_id === cat.id)
                .map((menu) => (
                  <li key={menu.id} className="border rounded-lg p-3">
                    {editingMenuId === menu.id ? (
                      <div className="flex flex-col w-full gap-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleSaveMenu(menu.id)}
                            className="text-sm px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            儲存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="font-semibold">
                            🍴 {menu.name}{' '}
                            <span className="text-gray-500">（NT$ {menu.price}）</span>
                          </div>
                          {menu.description && (
                            <div className="text-xs text-gray-500 mt-0.5">{menu.description}</div>
                          )}
                          <span
                            className={`inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs ${
                              menu.is_available
                                ? 'bg-emerald-600/15 text-emerald-600 border border-emerald-600/20'
                                : 'bg-red-600/15 text-red-600 border border-red-600/20'
                            }`}
                          >
                            {menu.is_available ? '販售中' : '停售中'}
                          </span>
                        </div>
                        <div className="flex gap-2 items-center shrink-0">
                          <button
                            onClick={() => handleEditMenu(menu)}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleToggleAvailable(menu.id, menu.is_available)}
                            className={`text-sm px-2 py-1 rounded text-white ${
                              menu.is_available
                                ? 'bg-amber-500 hover:bg-amber-600'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            {menu.is_available ? '停售' : '上架'}
                          </button>
                          <button
                            onClick={() => handleDeleteMenu(menu.id)}
                            className="text-sm text-red-600 hover:underline"
                          >
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
