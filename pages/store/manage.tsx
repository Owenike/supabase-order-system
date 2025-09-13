// pages/store/manage.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ConfirmPasswordModal from '@/components/ui/ConfirmPasswordModal';

type OptionValue = { label: string; value: string; price_delta?: number };
type OptionGroup = {
  id: string;
  name: string;
  input_type: 'single' | 'multi';
  values: OptionValue[];
};

interface Category {
  id: string;
  name: string;
  created_at?: string;
  store_id?: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  category_id: string;
  store_id: string;
  is_available: boolean;
  created_at?: string;
}

export default function StoreManagePage() {
  // ---- 你原有的狀態 ----
  const [storeId, setStoreId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [newMenu, setNewMenu] = useState<{ name: string; price: string; categoryId: string; description: string }>({
    name: '',
    price: '',
    categoryId: '',
    description: '',
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingMenu, setEditingMenu] = useState<{ name: string; price: string; description: string }>({
    name: '',
    price: '',
    description: '',
  });

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');

  // ---- 新增：選項 與 綁定 狀態 ----
  const [options, setOptions] = useState<OptionGroup[]>([]);
  // 分類綁定：cat_id -> option_id -> enabled/required
  const [catBound, setCatBound] = useState<Record<string, Record<string, boolean>>>({});
  const [catRequired, setCatRequired] = useState<Record<string, Record<string, boolean>>>({});
  // 單品覆蓋：item_id -> option_id -> enabled/required
  const [itemBound, setItemBound] = useState<Record<string, Record<string, boolean>>>({});
  const [itemRequired, setItemRequired] = useState<Record<string, Record<string, boolean>>>({});

  const [filterCat, setFilterCat] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>('');

  // ---- 選項管理（新增/編輯用）----
  const emptyValueRow: OptionValue = { label: '', value: '', price_delta: 0 };
  const [newOption, setNewOption] = useState<{ name: string; input_type: 'single' | 'multi'; values: OptionValue[] }>({
    name: '',
    input_type: 'single',
    values: [{ ...emptyValueRow }],
  });

  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOption, setEditingOption] = useState<{ name: string; input_type: 'single' | 'multi'; values: OptionValue[] }>({
    name: '',
    input_type: 'single',
    values: [{ ...emptyValueRow }],
  });

  // ---- 初始化：取 store_id、載資料 ----
  useEffect(() => {
    const storedId = localStorage.getItem('store_id');
    if (!storedId) return;
    setStoreId(storedId);
    void loadAll(storedId);
    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  const loadAll = useCallback(async (sid: string) => {
    setLoading(true);
    setErr('');
    try {
      await Promise.all([fetchCategories(sid), fetchMenus(sid), fetchOptions(sid)]);
      await Promise.all([fetchCategoryBindings(), fetchItemBindings()]);
    } catch (e: any) {
      setErr(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- 你原本的資料載入函式（保留） ----
  const fetchCategories = async (sid: string) => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('fetchCategories error:', error);
      return;
    }
    if (data) setCategories(data);
  };

  const fetchMenus = async (sid: string) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('fetchMenus error:', error);
      return;
    }
    if (data) setMenus(data as MenuItem[]);
  };

  // ---- 新增：載入 options 與 綁定 ----
  const fetchOptions = async (sid: string) => {
    const { data, error } = await supabase
      .from('options')
      .select('id, name, input_type, values')
      .eq('store_id', sid)
      .order('name', { ascending: true });
    if (error) {
      console.error('fetchOptions error:', error);
      return;
    }
    setOptions((data || []) as unknown as OptionGroup[]);
  };

  const fetchCategoryBindings = async () => {
    const { data, error } = await supabase
      .from('category_options')
      .select('category_id, option_id, required');
    if (error) {
      console.error('fetchCategoryBindings error:', error);
      return;
    }
    const bound: Record<string, Record<string, boolean>> = {};
    const req: Record<string, Record<string, boolean>> = {};
    (data || []).forEach((row: any) => {
      if (!bound[row.category_id]) bound[row.category_id] = {};
      if (!req[row.category_id]) req[row.category_id] = {};
      bound[row.category_id][row.option_id] = true;
      req[row.category_id][row.option_id] = !!row.required;
    });
    setCatBound(bound);
    setCatRequired(req);
  };

  const fetchItemBindings = async () => {
    const { data, error } = await supabase
      .from('item_options')
      .select('item_id, option_id, required');
    if (error) {
      console.error('fetchItemBindings error:', error);
      return;
    }
    const bound: Record<string, Record<string, boolean>> = {};
    const req: Record<string, Record<string, boolean>> = {};
    (data || []).forEach((row: any) => {
      if (!bound[row.item_id]) bound[row.item_id] = {};
      if (!req[row.item_id]) req[row.item_id] = {};
      bound[row.item_id][row.option_id] = true;
      req[row.item_id][row.option_id] = !!row.required;
    });
    setItemBound(bound);
    setItemRequired(req);
  };

  // ---- 你原本的操作（保留） ----
  const handleAddCategory = async () => {
    if (!newCategory.trim() || !storeId) return;
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('store_id', storeId)
      .eq('name', newCategory);

    if (existing && existing.length > 0) {
      alert(`分類名稱「${newCategory}」已存在，請改用其他名稱`);
      return;
    }

    await supabase.from('categories').insert({ name: newCategory, store_id: storeId });
    setNewCategory('');
    if (storeId) await fetchCategories(storeId);
  };

  const handleAddMenu = async () => {
    if (!newMenu.name || !newMenu.price || !newMenu.categoryId || !storeId) return;
    const { data: existing } = await supabase
      .from('menu_items')
      .select('id')
      .eq('store_id', storeId)
      .eq('name', newMenu.name);

    if (existing && existing.length > 0) {
      alert(`菜單名稱「${newMenu.name}」已存在，請改用其他名稱`);
      return;
    }

    await supabase.from('menu_items').insert({
      name: newMenu.name,
      price: Number(newMenu.price),
      description: newMenu.description,
      category_id: newMenu.categoryId,
      store_id: storeId,
      is_available: true,
    });

    setNewMenu({ name: '', price: '', categoryId: '', description: '' });
    if (storeId) await fetchMenus(storeId);
  };

  const handleToggleAvailable = async (id: string, current: boolean) => {
    await supabase.from('menu_items').update({ is_available: !current }).eq('id', id);
    if (storeId) await fetchMenus(storeId);
  };

  const handleDeleteMenu = (id: string) => {
    setPendingDeleteId(id);
    setShowConfirmModal(true);
  };

  const handleDeleteCategory = (id: string) => {
    setPendingDeleteId(id);
    setShowConfirmModal(true);
  };

  const handleConfirmedDelete = async (password: string) => {
    if (!userEmail || !pendingDeleteId) return;
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    });
    if (loginError) {
      alert('密碼錯誤，請再試一次');
      return;
    }

    const { error: delMenuError } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', pendingDeleteId);

    const { error: delCategoryError } = await supabase
      .from('categories')
      .delete()
      .eq('id', pendingDeleteId);

    if (delMenuError && delCategoryError) {
      alert('刪除失敗');
      return;
    }

    alert('✅ 刪除成功');
    if (storeId) {
      await Promise.all([fetchMenus(storeId), fetchCategories(storeId)]);
    }

    setPendingDeleteId(null);
    setShowConfirmModal(false);
  };

  const handleEditCategory = (id: string, name: string) => {
    setEditingCategoryId(id);
    setEditingCategoryName(name);
  };

  const handleSaveCategory = async (id: string) => {
    await supabase.from('categories').update({ name: editingCategoryName }).eq('id', id);
    setEditingCategoryId(null);
    if (storeId) await fetchCategories(storeId);
  };

  const handleEditMenu = (menu: MenuItem) => {
    setEditingMenuId(menu.id);
    setEditingMenu({
      name: menu.name,
      price: String(menu.price),
      description: menu.description || '',
    });
  };

  const handleSaveMenu = async (id: string) => {
    await supabase
      .from('menu_items')
      .update({
        name: editingMenu.name,
        price: Number(editingMenu.price),
        description: editingMenu.description,
      })
      .eq('id', id);
    setEditingMenuId(null);
    if (storeId) await fetchMenus(storeId);
  };

  // ---- 新增：分類/單品 綁定操作（透過 API，用 service_role） ----
  const toggleCategoryOption = async (categoryId: string, optionId: string, nextEnabled: boolean, required: boolean) => {
    try {
      // 樂觀更新
      setCatBound(prev => ({
        ...prev,
        [categoryId]: { ...(prev[categoryId] || {}), [optionId]: nextEnabled },
      }));
      setCatRequired(prev => ({
        ...prev,
        [categoryId]: { ...(prev[categoryId] || {}), [optionId]: required },
      }));

      const res = await fetch('/api/store/toggle-category-option', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId, option_id: optionId, enabled: nextEnabled, required }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '更新失敗');
    } catch (e: any) {
      alert('分類選項更新失敗：' + (e?.message || 'Unknown error'));
      // 還原
      setCatBound(prev => ({
        ...prev,
        [categoryId]: { ...(prev[categoryId] || {}), [optionId]: !nextEnabled },
      }));
    }
  };

  const toggleItemOption = async (itemId: string, optionId: string, nextEnabled: boolean, required: boolean) => {
    try {
      setItemBound(prev => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), [optionId]: nextEnabled },
      }));
      setItemRequired(prev => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), [optionId]: required },
      }));

      const res = await fetch('/api/store/toggle-item-option', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, option_id: optionId, enabled: nextEnabled, required }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '更新失敗');
    } catch (e: any) {
      alert('單品選項更新失敗：' + (e?.message || 'Unknown error'));
      // 還原
      setItemBound(prev => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), [optionId]: !nextEnabled },
      }));
    }
  };

  // ---- UI 繪製：分類選項綁定 ----
  const renderCategoryRow = (cat: Category) => {
    return (
      <tr key={cat.id} className="border-t">
        <td className="p-2 font-medium">{cat.name}</td>
        <td className="p-2">
          <div className="flex flex-wrap gap-2">
            {options.map(opt => {
              const enabled = !!catBound[cat.id]?.[opt.id];
              const required = !!catRequired[cat.id]?.[opt.id];
              return (
                <div key={opt.id} className="flex items-center gap-1 border rounded px-2 py-1">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => toggleCategoryOption(cat.id, opt.id, e.target.checked, required)}
                    />
                    <span>{opt.name}</span>
                  </label>
                  {enabled && (
                    <label className="flex items-center gap-1 text-xs ml-2">
                      <input
                        type="checkbox"
                        checked={required}
                        onChange={e => toggleCategoryOption(cat.id, opt.id, true, e.target.checked)}
                      />
                      <span>必填</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </td>
      </tr>
    );
  };

  // ---- UI 繪製：單品覆蓋 ----
  const filteredItems = useMemo(() => {
    if (filterCat === 'ALL') return menus;
    return menus.filter(i => i.category_id === filterCat);
  }, [menus, filterCat]);

  const renderItemRow = (item: MenuItem) => {
    return (
      <tr key={item.id} className="border-t">
        <td className="p-2">
          <div className="font-medium">{item.name}</div>
          <div className="text-xs text-gray-500">NT$ {item.price}</div>
        </td>
        <td className="p-2">
          <div className="flex flex-wrap gap-2">
            {options.map(opt => {
              const enabled = !!itemBound[item.id]?.[opt.id];
              const required = !!itemRequired[item.id]?.[opt.id];
              return (
                <div key={opt.id} className="flex items-center gap-1 border rounded px-2 py-1">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => toggleItemOption(item.id, opt.id, e.target.checked, required)}
                    />
                    <span>{opt.name}</span>
                  </label>
                  {enabled && (
                    <label className="flex items-center gap-1 text-xs ml-2">
                      <input
                        type="checkbox"
                        checked={required}
                        onChange={e => toggleItemOption(item.id, opt.id, true, e.target.checked)}
                      />
                      <span>必填</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ※ 單品設定會覆蓋分類預設（若未設定，將套用分類綁定）
          </div>
        </td>
      </tr>
    );
  };

  // ---- UI：選項管理（新增/編輯/刪除）----
  const addValueRow = (target: 'new' | 'edit') => {
    if (target === 'new') {
      setNewOption(prev => ({ ...prev, values: [...prev.values, { ...emptyValueRow }] }));
    } else {
      setEditingOption(prev => ({ ...prev, values: [...prev.values, { ...emptyValueRow }] }));
    }
  };
  const removeValueRow = (target: 'new' | 'edit', idx: number) => {
    if (target === 'new') {
      setNewOption(prev => ({ ...prev, values: prev.values.filter((_, i) => i !== idx) }));
    } else {
      setEditingOption(prev => ({ ...prev, values: prev.values.filter((_, i) => i !== idx) }));
    }
  };
  const updateValueRow = (target: 'new' | 'edit', idx: number, key: keyof OptionValue, value: string) => {
    if (target === 'new') {
      setNewOption(prev => ({
        ...prev,
        values: prev.values.map((row, i) => (i === idx ? { ...row, [key]: key === 'price_delta' ? Number(value || 0) : value } : row)),
      }));
    } else {
      setEditingOption(prev => ({
        ...prev,
        values: prev.values.map((row, i) => (i === idx ? { ...row, [key]: key === 'price_delta' ? Number(value || 0) : value } : row)),
      }));
    }
  };

  const submitNewOption = async () => {
    if (!storeId || !newOption.name.trim() || newOption.values.length === 0) {
      alert('請填寫完整選項名稱與至少一筆值'); return;
    }
    const payload = {
      id: null,
      store_id: storeId,
      name: newOption.name.trim(),
      input_type: newOption.input_type,
      values: newOption.values.map(v => ({ label: v.label.trim(), value: v.value.trim(), price_delta: Number(v.price_delta || 0) })),
    };
    const res = await fetch('/api/store/upsert-option', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { alert('新增失敗：' + (json?.error || 'Unknown')); return; }
    // 重載
    setNewOption({ name: '', input_type: 'single', values: [{ ...emptyValueRow }] });
    if (storeId) await fetchOptions(storeId);
  };

  const startEditOption = (opt: OptionGroup) => {
    setEditingOptionId(opt.id);
    setEditingOption({ name: opt.name, input_type: opt.input_type, values: opt.values.map(v => ({ ...v, price_delta: Number(v.price_delta || 0) })) });
  };

  const submitEditOption = async () => {
    if (!editingOptionId || !storeId || !editingOption.name.trim()) { alert('請填寫完整資料'); return; }
    const payload = {
      id: editingOptionId,
      store_id: storeId,
      name: editingOption.name.trim(),
      input_type: editingOption.input_type,
      values: editingOption.values.map(v => ({ label: v.label.trim(), value: v.value.trim(), price_delta: Number(v.price_delta || 0) })),
    };
    const res = await fetch('/api/store/upsert-option', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { alert('更新失敗：' + (json?.error || 'Unknown')); return; }
    setEditingOptionId(null);
    if (storeId) await fetchOptions(storeId);
  };

  const deleteOption = async (id: string) => {
    if (!confirm('確定刪除此選項？（會影響綁定關係）')) return;
    const res = await fetch('/api/store/delete-option', {
      method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) { alert('刪除失敗：' + (json?.error || 'Unknown')); return; }
    if (storeId) {
      await fetchOptions(storeId);
      await Promise.all([fetchCategoryBindings(), fetchItemBindings()]);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🍽 店家後台管理</h1>

      {err && <div className="mb-3 rounded border bg-red-50 text-red-700 p-2">{err}</div>}
      {loading && <div className="mb-3">讀取中…</div>}

      {/* ---- 選項管理 ---- */}
      <section className="mb-8">
        <h2 className="font-semibold text-lg mb-2">選項管理（甜度 / 冰塊 / 容量 等）</h2>

        {/* 新增選項 */}
        <div className="rounded border p-3 mb-6">
          <h3 className="font-medium mb-2">新增選項</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
            <input
              className="border px-3 py-2 rounded"
              placeholder="選項名稱（例：甜度）"
              value={newOption.name}
              onChange={(e) => setNewOption(prev => ({ ...prev, name: e.target.value }))}
            />
            <select
              className="border px-3 py-2 rounded"
              value={newOption.input_type}
              onChange={(e) => setNewOption(prev => ({ ...prev, input_type: e.target.value as 'single' | 'multi' }))}
            >
              <option value="single">單選</option>
              <option value="multi">多選</option>
            </select>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">可選值</div>
            {newOption.values.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                <input
                  className="border px-2 py-1 rounded"
                  placeholder="顯示名稱（例：半糖）"
                  value={row.label}
                  onChange={(e) => updateValueRow('new', idx, 'label', e.target.value)}
                />
                <input
                  className="border px-2 py-1 rounded"
                  placeholder="值（例：50）"
                  value={row.value}
                  onChange={(e) => updateValueRow('new', idx, 'value', e.target.value)}
                />
                <input
                  type="number"
                  className="border px-2 py-1 rounded"
                  placeholder="價差（例：10）"
                  value={String(row.price_delta ?? 0)}
                  onChange={(e) => updateValueRow('new', idx, 'price_delta', e.target.value)}
                />
                <div className="flex items-center">
                  <button className="text-sm text-red-600" onClick={() => removeValueRow('new', idx)}>
                    刪除此列
                  </button>
                </div>
              </div>
            ))}
            <button className="text-sm bg-gray-100 px-2 py-1 rounded" onClick={() => addValueRow('new')}>
              + 新增一列
            </button>
          </div>
          <div className="mt-3">
            <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={submitNewOption}>
              儲存選項
            </button>
          </div>
        </div>

        {/* 已有選項列表（可編輯/刪除） */}
        <div className="rounded border overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left w-48">選項名稱</th>
                <th className="p-2 text-left w-24">型態</th>
                <th className="p-2 text-left">可選值</th>
                <th className="p-2 text-left w-36">操作</th>
              </tr>
            </thead>
            <tbody>
              {options.map((opt) => (
                <tr key={opt.id} className="border-t align-top">
                  <td className="p-2">
                    {editingOptionId === opt.id ? (
                      <input
                        className="border px-2 py-1 rounded w-full"
                        value={editingOption.name}
                        onChange={(e) => setEditingOption(prev => ({ ...prev, name: e.target.value }))}
                      />
                    ) : (
                      <div className="font-medium">{opt.name}</div>
                    )}
                  </td>
                  <td className="p-2">
                    {editingOptionId === opt.id ? (
                      <select
                        className="border px-2 py-1 rounded"
                        value={editingOption.input_type}
                        onChange={(e) => setEditingOption(prev => ({ ...prev, input_type: e.target.value as 'single' | 'multi' }))}
                      >
                        <option value="single">單選</option>
                        <option value="multi">多選</option>
                      </select>
                    ) : (
                      <span>{opt.input_type === 'single' ? '單選' : '多選'}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {editingOptionId === opt.id ? (
                      <div>
                        {editingOption.values.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                            <input
                              className="border px-2 py-1 rounded"
                              placeholder="顯示名稱"
                              value={row.label}
                              onChange={(e) => updateValueRow('edit', idx, 'label', e.target.value)}
                            />
                            <input
                              className="border px-2 py-1 rounded"
                              placeholder="值"
                              value={row.value}
                              onChange={(e) => updateValueRow('edit', idx, 'value', e.target.value)}
                            />
                            <input
                              type="number"
                              className="border px-2 py-1 rounded"
                              placeholder="價差"
                              value={String(row.price_delta ?? 0)}
                              onChange={(e) => updateValueRow('edit', idx, 'price_delta', e.target.value)}
                            />
                            <div className="flex items-center">
                              <button className="text-sm text-red-600" onClick={() => removeValueRow('edit', idx)}>
                                刪除此列
                              </button>
                            </div>
                          </div>
                        ))}
                        <button className="text-sm bg-gray-100 px-2 py-1 rounded" onClick={() => addValueRow('edit')}>
                          + 新增一列
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-700">
                        {opt.values.length === 0 ? '—' : opt.values.map((v, i) => (
                          <span key={i} className="inline-block mr-2 mb-1">
                            {v.label}
                            {typeof v.price_delta === 'number' && v.price_delta !== 0 ? ` (+$${v.price_delta})` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    {editingOptionId === opt.id ? (
                      <div className="flex gap-2">
                        <button className="text-sm bg-green-600 text-white px-2 py-1 rounded" onClick={submitEditOption}>
                          儲存
                        </button>
                        <button className="text-sm px-2 py-1 rounded border" onClick={() => setEditingOptionId(null)}>
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button className="text-sm text-blue-600" onClick={() => startEditOption(opt)}>
                          編輯
                        </button>
                        <button className="text-sm text-red-600" onClick={() => deleteOption(opt.id)}>
                          刪除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {options.length === 0 && (
                <tr><td className="p-2" colSpan={4}>尚無選項，請先於上方新增（例：甜度 / 冰塊 / 容量）。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- 分類 ⇄ 選項 綁定 ---- */}
      <section className="mb-8">
        <h2 className="font-semibold text-lg mb-2">分類選項綁定</h2>
        <div className="rounded border overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left w-48">分類</th>
                <th className="p-2 text-left">可用選項（勾選啟用，可指定「必填」）</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-t">
                  <td className="p-2 font-medium">{cat.name}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      {options.map((opt) => {
                        const enabled = !!catBound[cat.id]?.[opt.id];
                        const required = !!catRequired[cat.id]?.[opt.id];
                        return (
                          <div key={opt.id} className="flex items-center gap-1 border rounded px-2 py-1">
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) =>
                                  toggleCategoryOption(cat.id, opt.id, e.target.checked, required)
                                }
                              />
                              <span>{opt.name}</span>
                            </label>
                            {enabled && (
                              <label className="flex items-center gap-1 text-xs ml-2">
                                <input
                                  type="checkbox"
                                  checked={required}
                                  onChange={(e) =>
                                    toggleCategoryOption(cat.id, opt.id, true, e.target.checked)
                                  }
                                />
                                <span>必填</span>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr><td className="p-2" colSpan={2}>尚無分類</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- 單品覆蓋 ---- */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">單品覆蓋（特例設定）</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm">分類篩選</label>
            <select
              className="border px-2 py-1 rounded"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
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
                <th className="p-2 text-left">可用選項（勾選啟用，可指定「必填」）</th>
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
                    <div className="flex flex-wrap gap-2">
                      {options.map((opt) => {
                        const enabled = !!itemBound[item.id]?.[opt.id];
                        const required = !!itemRequired[item.id]?.[opt.id];
                        return (
                          <div key={opt.id} className="flex items-center gap-1 border rounded px-2 py-1">
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) =>
                                  toggleItemOption(item.id, opt.id, e.target.checked, required)
                                }
                              />
                              <span>{opt.name}</span>
                            </label>
                            {enabled && (
                              <label className="flex items-center gap-1 text-xs ml-2">
                                <input
                                  type="checkbox"
                                  checked={required}
                                  onChange={(e) =>
                                    toggleItemOption(item.id, opt.id, true, e.target.checked)
                                  }
                                />
                                <span>必填</span>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      ※ 單品設定會覆蓋分類預設（若未設定，將套用分類綁定）
                    </div>
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
                          <span
                            className={`ml-2 text-xs ${menu.is_available ? 'text-green-600' : 'text-red-600'}`}
                          >
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
            setShowConfirmModal(false);
            setPendingDeleteId(null);
          }}
          onConfirm={handleConfirmedDelete}
        />
      )}
    </div>
  );
}
