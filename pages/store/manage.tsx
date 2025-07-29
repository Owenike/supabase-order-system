import { useEffect, useState } from 'react'
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

export default function StoreManagePage() {
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

  useEffect(() => {
    const storedId = localStorage.getItem('store_id')
    if (!storedId) return
    setStoreId(storedId)
    fetchCategories(storedId)
    fetchMenus(storedId)
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })
  }, [])
  const fetchCategories = async (storeId: string) => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true })
    if (error) console.error('fetchCategories error:', error)
    if (data) setCategories(data)
  }

  const fetchMenus = async (storeId: string) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true })
    if (error) console.error('fetchMenus error:', error)
    if (data) setMenus(data)
  }

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
    fetchCategories(storeId)
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
    fetchMenus(storeId)
  }

  const handleToggleAvailable = async (id: string, current: boolean) => {
    await supabase.from('menu_items').update({ is_available: !current }).eq('id', id)
    if (storeId) fetchMenus(storeId)
  }

  const handleDeleteMenu = (id: string) => {
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

    const { error } = await supabase.from('menu_items').delete().eq('id', pendingDeleteId)
    if (error) {
      alert('刪除失敗：' + error.message)
      return
    }

    alert('✅ 刪除成功')
    if (storeId) fetchMenus(storeId)
    setPendingDeleteId(null)
    setShowConfirmModal(false)
  }
  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      console.error('handleDeleteCategory error:', error)
      alert(error.message)
      return
    }
    if (storeId) {
      fetchCategories(storeId)
      fetchMenus(storeId)
    }
  }

  const handleEditCategory = (id: string, name: string) => {
    setEditingCategoryId(id)
    setEditingCategoryName(name)
  }

  const handleSaveCategory = async (id: string) => {
    await supabase.from('categories').update({ name: editingCategoryName }).eq('id', id)
    setEditingCategoryId(null)
    if (storeId) fetchCategories(storeId)
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
    if (storeId) fetchMenus(storeId)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🍽 店家後台管理</h1>

      <div className="mb-6">
        <h2 className="font-semibold mb-2">新增分類</h2>
        <div className="flex gap-2">
          <input
            type="text"
            className="border px-3 py-2 rounded w-full"
            placeholder="分類名稱"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          />
          <button
            onClick={handleAddCategory}
            className="bg-blue-600 text-white px-4 rounded"
          >
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
            onChange={e => setNewMenu({ ...newMenu, name: e.target.value })}
          />
          <input
            type="number"
            className="border px-3 py-2 rounded"
            placeholder="價格"
            value={newMenu.price}
            onChange={e => setNewMenu({ ...newMenu, price: e.target.value })}
          />
          <input
            type="text"
            className="border px-3 py-2 rounded"
            placeholder="描述（選填）"
            value={newMenu.description}
            onChange={e => setNewMenu({ ...newMenu, description: e.target.value })}
          />
          <select
            className="border px-3 py-2 rounded"
            value={newMenu.categoryId}
            onChange={e => setNewMenu({ ...newMenu, categoryId: e.target.value })}
          >
            <option value="">選擇分類</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAddMenu}
          className="mt-2 bg-green-600 text-white px-4 py-2 rounded"
        >
          新增菜單
        </button>
      </div>
      <div>
        <h2 className="font-semibold mb-2">現有分類與菜單</h2>
        {categories.map(cat => (
          <div key={cat.id} className="mb-4 border-b pb-2">
            <div className="flex justify-between items-center mb-1">
              {editingCategoryId === cat.id ? (
                <div className="flex gap-2 items-center w-full">
                  <input
                    className="border px-2 py-1 rounded w-full"
                    value={editingCategoryName}
                    onChange={e => setEditingCategoryName(e.target.value)}
                  />
                  <button
                    onClick={() => handleSaveCategory(cat.id)}
                    className="text-sm text-white bg-green-600 px-2 py-1 rounded"
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
                      className="text-sm text-blue-600"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="text-sm text-red-600"
                    >
                      刪除
                    </button>
                  </div>
                </>
              )}
            </div>

            <ul className="pl-4 list-disc text-sm space-y-1">
              {menus.filter(menu => menu.category_id === cat.id).map(menu => (
                <li key={menu.id}>
                  {editingMenuId === menu.id ? (
                    <div className="flex flex-col w-full gap-1">
                      <input
                        className="border px-2 py-1 rounded"
                        value={editingMenu.name}
                        onChange={e => setEditingMenu({ ...editingMenu, name: e.target.value })}
                      />
                      <input
                        className="border px-2 py-1 rounded"
                        value={editingMenu.price}
                        onChange={e => setEditingMenu({ ...editingMenu, price: e.target.value })}
                      />
                      <input
                        className="border px-2 py-1 rounded"
                        value={editingMenu.description}
                        onChange={e => setEditingMenu({ ...editingMenu, description: e.target.value })}
                      />
                      <button
                        onClick={() => handleSaveMenu(menu.id)}
                        className="text-sm bg-green-600 text-white px-2 py-1 rounded mt-1 self-end"
                      >
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
                        <button
                          onClick={() => handleEditMenu(menu)}
                          className="text-sm text-blue-600"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleToggleAvailable(menu.id, menu.is_available)}
                          className="text-sm bg-yellow-500 text-white px-2 py-1 rounded"
                        >
                          {menu.is_available ? '停售' : '上架'}
                        </button>
                        <button
                          onClick={() => handleDeleteMenu(menu.id)}
                          className="text-sm text-red-600"
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
