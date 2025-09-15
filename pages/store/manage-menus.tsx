'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import ConfirmPasswordModal from '@/components/ui/ConfirmPasswordModal'
import { Button } from '@/components/ui/button'

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
  const [newMenu, setNewMenu] = useState<{ name: string; price: string; categoryId: string; description: string }>(
    { name: '', price: '', categoryId: '', description: '' }
  )

  // 編輯用
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingMenu, setEditingMenu] = useState<{ name: string; price: string; description: string }>(
    { name: '', price: '', description: '' }
  )

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
      if (data?.user?.email) setUserEmail(data.user.email!)
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
    if (error) return console.error('fetchCategories error:', error)
    if (data) setCategories(data as Category[])
  }

  const fetchMenus = async (sid: string) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: true })
    if (error) return console.error('fetchMenus error:', error)
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
    setEditingMenu({ name: menu.name, price: String(menu.price), description: menu.description || '' })
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

  // ====== Icons ======
  const PlusIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
  const EditIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 21h18M5 17l10-10 4 4-10 10H5z" />
    </svg>
  )
  const TrashIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6l1-2h6l1 2M6 6l1 14h10L18 6" />
    </svg>
  )
  const RefreshIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 12a8 8 0 10-2.34 5.66M20 12v5h-5" />
    </svg>
  )

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      {/* 頁首（深色、與首頁一致） */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">📋</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">分類與菜單管理</h1>
            <p className="text-white/70 text-sm mt-1">快速新增分類、餐點與上下架</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={handleRefresh} startIcon={<RefreshIcon />}>
            重新整理
          </Button>
        </div>
      </div>

      {/* 膠囊導覽（黃底高亮當前頁） */}
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
      {err && <div className="mb-4 rounded border border-red-400/30 bg-red-500/10 text-red-200 p-3">❌ {err}</div>}
      {loading && <div className="mb-4 text-white/80">讀取中…</div>}

      {/* ---- 新增分類 ---- */}
      <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-6">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-lg font-semibold">新增分類</h2>
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              className="border px-3 py-2 rounded w-full bg-white text-gray-900"
              placeholder="分類名稱"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <Button onClick={handleAddCategory} startIcon={<PlusIcon />}>
              新增
            </Button>
          </div>
        </div>
      </div>

      {/* ---- 新增菜單 ---- */}
      <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-6">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-lg font-semibold">新增菜單</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="text"
              className="border px-3 py-2 rounded bg-white text-gray-900"
              placeholder="菜名"
              value={newMenu.name}
              onChange={(e) => setNewMenu({ ...newMenu, name: e.target.value })}
            />
            <input
              type="number"
              className="border px-3 py-2 rounded bg-white text-gray-900"
              placeholder="價格"
              value={newMenu.price}
              onChange={(e) => setNewMenu({ ...newMenu, price: e.target.value })}
            />
            <input
              type="text"
              className="border px-3 py-2 rounded bg-white text-gray-900"
              placeholder="描述（選填）"
              value={newMenu.description}
              onChange={(e) => setNewMenu({ ...newMenu, description: e.target.value })}
            />
            <select
              className="border px-3 py-2 rounded bg-white text-gray-900"
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
          <Button className="mt-3" variant="success" onClick={handleAddMenu} startIcon={<PlusIcon />}>
            新增菜單
          </Button>
        </div>
      </div>

      {/* ---- 現有分類與菜單清單 ---- */}
      <div className="space-y-4">
        <h2 className="text-white font-semibold">現有分類與菜單</h2>

        {categories.length === 0 && !loading && (
          <div className="bg-[#2B2B2B] text-white rounded-lg border border-white/10 shadow p-4">
            <p className="text-white/70">目前尚無分類，請先於上方新增分類。</p>
          </div>
        )}

        {categories.map((cat) => (
          <div key={cat.id} className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10">
            {/* 分類列 */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              {editingCategoryId === cat.id ? (
                <div className="flex gap-2 items-center w-full">
                  <input
                    className="border px-2 py-1 rounded w-full bg-white text-gray-900"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                  />
                  <Button size="sm" variant="success" onClick={() => handleSaveCategory(cat.id)}>
                    儲存
                  </Button>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold">{cat.name}</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="soft" startIcon={<EditIcon />} onClick={() => handleEditCategory(cat.id, cat.name)}>
                      編輯
                    </Button>
                    <Button size="sm" variant="destructive" startIcon={<TrashIcon />} onClick={() => handleDeleteCategory(cat.id)}>
                      刪除
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* 該分類的菜單列表 */}
            <ul className="p-4 space-y-2">
              {menus.filter((m) => m.category_id === cat.id).length === 0 && (
                <li className="text-sm text-white/70">此分類尚無菜單。</li>
              )}

              {menus
                .filter((menu) => menu.category_id === cat.id)
                .map((menu) => (
                  <li key={menu.id} className="border border-white/10 rounded-lg p-3">
                    {editingMenuId === menu.id ? (
                      <div className="flex flex-col w-full gap-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            className="border px-2 py-1 rounded bg-white text-gray-900"
                            value={editingMenu.name}
                            onChange={(e) => setEditingMenu({ ...editingMenu, name: e.target.value })}
                          />
                          <input
                            className="border px-2 py-1 rounded bg-white text-gray-900"
                            value={editingMenu.price}
                            onChange={(e) => setEditingMenu({ ...editingMenu, price: e.target.value })}
                          />
                          <input
                            className="border px-2 py-1 rounded bg-white text-gray-900"
                            value={editingMenu.description}
                            onChange={(e) => setEditingMenu({ ...editingMenu, description: e.target.value })}
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button size="sm" variant="success" onClick={() => handleSaveMenu(menu.id)}>
                            儲存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="font-semibold">
                            🍴 {menu.name}{' '}
                            <span className="text-white/60">（NT$ {menu.price}）</span>
                          </div>
                          {menu.description && (
                            <div className="text-xs text-white/60 mt-0.5">{menu.description}</div>
                          )}
                          <span
                            className={`inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs border ${
                              menu.is_available
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
                                : 'bg-red-500/15 text-red-300 border-red-400/20'
                            }`}
                          >
                            {menu.is_available ? '販售中' : '停售中'}
                          </span>
                        </div>
                        <div className="flex gap-2 items-center shrink-0">
                          <Button size="sm" variant="soft" startIcon={<EditIcon />} onClick={() => handleEditMenu(menu)}>
                            編輯
                          </Button>
                          <Button
                            size="sm"
                            variant={menu.is_available ? 'warning' : 'success'}
                            onClick={() => handleToggleAvailable(menu.id, menu.is_available)}
                          >
                            {menu.is_available ? '停售' : '上架'}
                          </Button>
                          <Button size="sm" variant="destructive" startIcon={<TrashIcon />} onClick={() => handleDeleteMenu(menu.id)}>
                            刪除
                          </Button>
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
