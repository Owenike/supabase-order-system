// pages/admin/store-list.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/router';

type Store = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

type StoreRow = Store & {
  // 內用旗標（無紀錄視為 true）
  dine_in_enabled: boolean;
};

/** 取得帶 Authorization 的 headers；沒有 token 時就不帶 Authorization */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function StoreListPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 正在切換的 store_id
  const router = useRouter();

  useEffect(() => {
    const checkSessionAndFetch = async () => {
      setLoading(true);
      setError('');

      // 略等 300ms，避免既有的 auth 初始化 race condition
      await new Promise((r) => setTimeout(r, 300));

      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes.data.session;

      if (!session || session.user.user_metadata?.role !== 'admin') {
        router.replace('/admin/login');
        return;
      }

      // 1) 讀 stores
      const { data: storesData, error: storesErr } = await supabase
        .from('stores')
        .select('id, name, email, phone, is_active, created_at')
        .order('created_at', { ascending: false });

      if (storesErr) {
        setError(storesErr.message);
        setLoading(false);
        return;
      }

      const baseRows: StoreRow[] =
        (storesData as Store[]).map((s) => ({
          ...s,
          email: s.email ?? null,
          phone: s.phone ?? null,
          dine_in_enabled: true, // 預設啟用，等會用旗標覆蓋
        })) ?? [];

      // 2) 一次抓回所有店家的 dine_in 旗標
      const ids = baseRows.map((s) => s.id);
      if (ids.length > 0) {
        const { data: flags, error: flagsErr } = await supabase
          .from('store_feature_flags')
          .select('store_id, feature_key, enabled')
          .in('store_id', ids)
          .eq('feature_key', 'dine_in');

        if (flagsErr) {
          console.warn('fetch dine_in flags failed:', flagsErr.message);
        } else if (flags && flags.length > 0) {
          const map = new Map<string, boolean>();
          (flags as any[]).forEach((f) => map.set(f.store_id as string, !!f.enabled));
          baseRows.forEach((row) => {
            if (map.has(row.id)) row.dine_in_enabled = !!map.get(row.id);
          });
        }
      }

      setStores(baseRows);
      setLoading(false);
    };

    void checkSessionAndFetch();
  }, [router]);

  const handleEditName = async (storeId: string, currentName: string) => {
    const newName = prompt('請輸入新的店名：', currentName);
    if (!newName || newName.trim() === '' || newName === currentName) return;

    const { error } = await supabase
      .from('stores')
      .update({ name: newName.trim() })
      .eq('id', storeId);

    if (error) {
      alert('❌ 修改失敗：' + error.message);
    } else {
      alert('✅ 店名已更新');
      setStores((prev) =>
        prev.map((s) => (s.id === storeId ? { ...s, name: newName.trim() } : s))
      );
    }
  };

  const handleDelete = async (email: string, store_id: string) => {
    const confirmDel = window.confirm(
      `你確定要刪除 ${email} 的帳號嗎？此操作無法還原`
    );
    if (!confirmDel) return;

    const password = prompt('請輸入管理員密碼確認刪除：');
    if (!password) return;

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      alert('登入狀態失效，請重新登入');
      return;
    }

    const adminEmail = session.user.email;
    const { data: adminAccount, error: fetchErr } = await supabase
      .from('store_accounts')
      .select('password_hash')
      .eq('email', adminEmail)
      .single();

    if (fetchErr || !adminAccount?.password_hash) {
      alert('驗證管理員密碼失敗');
      return;
    }

    const bcrypt = await import('bcryptjs');
    const match = await bcrypt.compare(password, adminAccount.password_hash);

    if (!match) {
      alert('❌ 密碼錯誤，無法刪除');
      return;
    }

    const headers = await getAuthHeaders();
    const res = await fetch('/api/delete-store', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ email, store_id }),
      credentials: 'include', // 帶 Supabase Cookie
    });

    const result = await res.json();
    if (res.ok) {
      alert('✅ 刪除成功！');
      setStores((prev) => prev.filter((s) => s.id !== store_id));
    } else {
      alert('❌ 刪除失敗：' + (result?.error || 'Unknown error'));
    }
  };

  const handleToggleActive = async (
    email: string,
    store_id: string,
    isActive: boolean
  ) => {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/toggle-store-active', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ email, store_id, is_active: isActive }),
      credentials: 'include',
    });

    const result = await res.json();
    if (res.ok) {
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? { ...s, is_active: isActive } : s))
      );
    } else {
      alert('❌ 操作失敗：' + (result?.error || 'Unknown error'));
    }
  };

  // 新增：切換「內用」旗標
  const handleToggleDineIn = async (store_id: string) => {
    try {
      setBusy(store_id);

      // 樂觀更新：先反轉
      setStores((prev) =>
        prev.map((s) =>
          s.id === store_id ? { ...s, dine_in_enabled: !s.dine_in_enabled } : s
        )
      );

      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/toggle-dinein', {
        method: 'POST',
        headers,
        body: JSON.stringify({ store_id }),
        credentials: 'include', // 帶 Supabase Cookie
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || '切換失敗');
      }

      // 以後端值校正
      setStores((prev) =>
        prev.map((s) =>
          s.id === store_id ? { ...s, dine_in_enabled: !!json.dine_in_enabled } : s
        )
      );
    } catch (e: any) {
      alert('❌ 內用開關切換失敗：' + (e?.message || 'Unknown error'));
      // 還原
      setStores((prev) =>
        prev.map((s) =>
          s.id === store_id ? { ...s, dine_in_enabled: !s.dine_in_enabled } : s
        )
      );
    } finally {
      setBusy(null);
    }
  };

  const tableBody = useMemo(() => {
    return stores.map((store) => (
      <tr key={store.id} className="border-t">
        <td className="p-2">{store.name}</td>
        <td className="p-2">{store.email || '—'}</td>
        <td className="p-2">{store.phone || '—'}</td>
        <td className="p-2 space-x-2 text-center">
          {/* 編輯 */}
          <button
            onClick={() => handleEditName(store.id, store.name)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
          >
            編輯
          </button>

          {/* 內用開關：dine_in_enabled=true → 顯示「封鎖內用」 */}
          <button
            onClick={() => handleToggleDineIn(store.id)}
            disabled={busy === store.id}
            className={`px-3 py-1 rounded font-medium ${
              store.dine_in_enabled
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            title={
              store.dine_in_enabled
                ? '目前允許內用，點擊後將封鎖內用'
                : '目前已封鎖內用，點擊後將啟動內用'
            }
          >
            {busy === store.id
              ? '…處理中'
              : store.dine_in_enabled
              ? '封鎖內用'
              : '啟動內用'}
          </button>

          {/* 啟用/暫停（你原有的 is_active） */}
          <button
            onClick={() =>
              handleToggleActive(store.email || '', store.id, !store.is_active)
            }
            className={`px-3 py-1 rounded font-medium ${
              store.is_active
                ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {store.is_active ? '暫停' : '啟用'}
          </button>

          {/* 刪除 */}
          <button
            onClick={() => handleDelete(store.email || '', store.id)}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
          >
            刪除
          </button>
        </td>
      </tr>
    ));
  }, [stores, busy]);

  return (
    <div className="max-w-4xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-6">📋 店家清單</h1>
      {loading && <p>讀取中...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && stores.length === 0 && <p>目前沒有店家</p>}

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">店名</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">電話</th>
            <th className="p-2 text-center">操作</th>
          </tr>
        </thead>
        <tbody>{tableBody}</tbody>
      </table>
    </div>
  );
}
