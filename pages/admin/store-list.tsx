// pages/admin/store-list.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/router'
import { formatROCRange, isExpired } from '@/lib/date'

type Store = {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  trial_start_at: string | null
  trial_end_at: string | null
}

type StoreRow = Store & {
  dine_in_enabled: boolean // 內用
  takeout_enabled: boolean // 外帶
  expired: boolean         // 已逾期
}

/** 取得最新 access token（必要時 refresh）並組 headers */
async function getAuthHeaders(): Promise<Record<string, string>> {
  // 先拿現有 session
  let { data: sess } = await supabase.auth.getSession()
  // 若沒有，refresh 一次
  if (!sess.session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    sess = refreshed
  }
  const token = sess.session?.access_token || ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/** 包一層 POST，若 401 會自動 refresh 後重試一次 */
async function apiPost(url: string, body: unknown) {
  let headers = await getAuthHeaders()
  let resp = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (resp.status === 401) {
    await supabase.auth.refreshSession()
    headers = await getAuthHeaders()
    resp = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    })
  }
  return resp
}

/** 前端 admin 判斷（避免誤判導回 login；API 端仍會再驗一次） */
function sessionIsAdmin(session: any): boolean {
  const u = session?.user
  if (!u) return false
  const um = u.user_metadata || {}
  const am = (u as any).app_metadata || {}
  const roles = new Set<string>()
  const push = (v: any) => {
    if (!v) return
    if (Array.isArray(v)) v.forEach((x) => x && roles.add(String(x)))
    else roles.add(String(v))
  }
  push(um.role); push(um.roles); push(am.role); push(am.roles)
  return roles.has('admin')
}

export default function StoreListPage() {
  const [stores, setStores] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // 正在切換的 store_id
  const router = useRouter()

  useEffect(() => {
    const checkSessionAndFetch = async () => {
      setLoading(true)
      setError('')

      await new Promise((r) => setTimeout(r, 200))

      const sessionRes = await supabase.auth.getSession()
      const session = sessionRes.data.session

      if (!session || !sessionIsAdmin(session)) {
        router.replace('/admin/login')
        return
      }

      // 1) 讀 stores（取回試用期欄位）
      const { data: storesData, error: storesErr } = await supabase
        .from('stores')
        .select('id, name, email, phone, is_active, created_at, trial_start_at, trial_end_at')
        .order('created_at', { ascending: false })

      if (storesErr) {
        setError(storesErr.message)
        setLoading(false)
        return
      }

      const baseRows: StoreRow[] =
        (storesData as Store[]).map((s) => ({
          ...s,
          email: s.email ?? null,
          phone: s.phone ?? null,
          dine_in_enabled: true,
          takeout_enabled: true,
          expired: isExpired(s.trial_end_at), // ✅ 計算是否逾期
        })) ?? []

      // 2) 一次抓回所有店家的 dine_in / takeout 旗標
      const ids = baseRows.map((s) => s.id)
      if (ids.length > 0) {
        const { data: flags } = await supabase
          .from('store_feature_flags')
          .select('store_id, feature_key, enabled')
          .in('store_id', ids)
          .in('feature_key', ['dine_in', 'takeout'])

        if (flags && flags.length > 0) {
          const flagMap = new Map<string, Record<string, boolean>>()
          ;(flags as any[]).forEach((f) => {
            const sid = f.store_id as string
            const key = f.feature_key as string
            const enabled = !!f.enabled
            const obj = flagMap.get(sid) || {}
            obj[key] = enabled
            flagMap.set(sid, obj)
          })
          baseRows.forEach((row) => {
            const obj = flagMap.get(row.id)
            if (obj) {
              if ('dine_in' in obj) row.dine_in_enabled = !!obj.dine_in
              if ('takeout' in obj) row.takeout_enabled = !!obj.takeout
            }
          })
        }
      }

      setStores(baseRows)
      setLoading(false)

      // 3) ✅ 自動停用：若已逾期但仍為 is_active=true，呼叫 API 停用
      //   （可選；若你想僅顯示不自動關閉，可移除這段）
      for (const row of baseRows) {
        if (row.expired && row.is_active) {
          try {
            let headers = await getAuthHeaders()
            const resp = await fetch('/api/toggle-store-active', {
              method: 'PATCH',
              headers,
              credentials: 'include',
              body: JSON.stringify({ email: row.email || '', store_id: row.id, is_active: false }),
            })
            if (resp.status === 401) {
              await supabase.auth.refreshSession()
              headers = await getAuthHeaders()
              await fetch('/api/toggle-store-active', {
                method: 'PATCH',
                headers,
                credentials: 'include',
                body: JSON.stringify({ email: row.email || '', store_id: row.id, is_active: false }),
              })
            }
            // 本地也同步為停用
            setStores((prev) => prev.map((s) => (s.id === row.id ? { ...s, is_active: false } : s)))
          } catch {
            // 靜默忽略；管理員仍可手動按「暫停」
          }
        }
      }
    }

    void checkSessionAndFetch()
  }, [router])

  const handleEditName = async (storeId: string, currentName: string) => {
    const newName = prompt('請輸入新的店名：', currentName)
    if (!newName || newName.trim() === '' || newName === currentName) return

    const { error } = await supabase.from('stores').update({ name: newName.trim() }).eq('id', storeId)
    if (error) {
      alert('❌ 修改失敗：' + error.message)
    } else {
      alert('✅ 店名已更新')
      setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, name: newName.trim() } : s)))
    }
  }

  const handleDelete = async (email: string, store_id: string) => {
    const confirmDel = window.confirm(`你確定要刪除 ${email} 的帳號嗎？此操作無法還原`)
    if (!confirmDel) return

    const password = prompt('請輸入管理員密碼確認刪除：')
    if (!password) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return alert('登入狀態失效，請重新登入')

    const adminEmail = session.user.email!
    const { data: adminAccount } = await supabase
      .from('store_accounts')
      .select('password_hash')
      .eq('email', adminEmail)
      .maybeSingle()

    if (!adminAccount?.password_hash) return alert('驗證管理員密碼失敗')

    const bcrypt = await import('bcryptjs')
    const match = await bcrypt.compare(password, adminAccount.password_hash)
    if (!match) return alert('❌ 密碼錯誤，無法刪除')

    let headers = await getAuthHeaders()
    let res = await fetch('/api/delete-store', {
      method: 'DELETE',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, store_id }),
    })
    if (res.status === 401) {
      await supabase.auth.refreshSession()
      headers = await getAuthHeaders()
      res = await fetch('/api/delete-store', {
        method: 'DELETE',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email, store_id }),
      })
    }

    const result = await res.json()
    if (res.ok) {
      alert('✅ 刪除成功！')
      setStores((prev) => prev.filter((s) => s.id !== store_id))
    } else {
      alert('❌ 刪除失敗：' + (result?.error || 'Unknown error'))
    }
  }

  // === 單獨切換「內用 / 外帶」：呼叫 Server API ===
  const handleToggleDineIn = async (store_id: string) => {
    try {
      setBusy(store_id)
      // 樂觀更新
      setStores((prev) => prev.map((s) => (s.id === store_id ? { ...s, dine_in_enabled: !s.dine_in_enabled } : s)))

      const resp = await apiPost('/api/admin/toggle-dinein', { store_id })
      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || '切換失敗')

      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? { ...s, dine_in_enabled: !!json.dine_in_enabled } : s))
      )
    } catch (e: any) {
      alert('❌ 內用開關切換失敗：' + (e?.message || 'Unknown error'))
      // 還原
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? { ...s, dine_in_enabled: !s.dine_in_enabled } : s))
      )
    } finally {
      setBusy(null)
    }
  }

  const handleToggleTakeout = async (store_id: string) => {
    try {
      setBusy(store_id)
      // 樂觀更新
      setStores((prev) => prev.map((s) => (s.id === store_id ? { ...s, takeout_enabled: !s.takeout_enabled } : s)))

      const resp = await apiPost('/api/admin/toggle-takeout', { store_id })
      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || '切換失敗')

      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? { ...s, takeout_enabled: !!json.takeout_enabled } : s))
      )
    } catch (e: any) {
      alert('❌ 外帶開關切換失敗：' + (e?.message || 'Unknown error'))
      // 還原
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? { ...s, takeout_enabled: !s.takeout_enabled } : s))
      )
    } finally {
      setBusy(null)
    }
  }

  // === 啟用/暫停：只改 is_active（到期自動停用也會走這條） ===
  const handleToggleActive = async (email: string, store_id: string, isActive: boolean) => {
    try {
      let headers = await getAuthHeaders()
      let res = await fetch('/api/toggle-store-active', {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email, store_id, is_active: isActive }),
      })
      if (res.status === 401) {
        await supabase.auth.refreshSession()
        headers = await getAuthHeaders()
        res = await fetch('/api/toggle-store-active', {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify({ email, store_id, is_active: isActive }),
        })
      }
      const result = await res.json()
      if (!res.ok) throw new Error(result?.error || 'toggle-store-active failed')

      setStores((prev) => prev.map((s) => (s.id === store_id ? { ...s, is_active: isActive } : s)))
    } catch (e: any) {
      alert('❌ 操作失敗：' + (e?.message || 'Unknown error'))
    }
  }

  const tableBody = useMemo(() => {
    return stores.map((store) => {
      const period =
        store.trial_start_at && store.trial_end_at
          ? `（期限${formatROCRange(store.trial_start_at, store.trial_end_at)}）`
          : ''
      return (
        <tr key={store.id} className={`border-t ${store.expired ? 'bg-red-50' : ''}`}>
          <td className="p-2">
            <div className="font-medium">
              {store.name} {period}
            </div>
            {!store.is_active && (
              <div className="text-xs text-red-600 mt-0.5">已停用{store.expired ? '（試用到期）' : ''}</div>
            )}
          </td>
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

            {/* 內用開關 */}
            <button
              onClick={() => handleToggleDineIn(store.id)}
              disabled={busy === store.id || !store.is_active}
              className={`px-3 py-1 rounded font-medium ${
                store.dine_in_enabled
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              } ${!store.is_active ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                store.dine_in_enabled
                  ? '目前允許內用，點擊後將封鎖內用'
                  : '目前已封鎖內用，點擊後將啟動內用'
              }
            >
              {busy === store.id ? '…處理中' : store.dine_in_enabled ? '封鎖內用' : '啟動內用'}
            </button>

            {/* 外帶開關 */}
            <button
              onClick={() => handleToggleTakeout(store.id)}
              disabled={busy === store.id || !store.is_active}
              className={`px-3 py-1 rounded font-medium ${
                store.takeout_enabled
                  ? 'bg-sky-600 hover:bg-sky-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              } ${!store.is_active ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                store.takeout_enabled
                  ? '目前允許外帶，點擊後將封鎖外帶'
                  : '目前已封鎖外帶，點擊後將啟動外帶'
              }
            >
              {busy === store.id ? '…處理中' : store.takeout_enabled ? '封鎖外帶' : '啟動外帶'}
            </button>

            {/* 啟用/暫停（只改 is_active） */}
            <button
              onClick={() => handleToggleActive(store.email || '', store.id, !store.is_active)}
              className={`px-3 py-1 rounded font-medium ${
                store.is_active
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
              title={store.is_active ? '暫停帳號' : '啟用帳號'}
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
      )
    })
  }, [stores, busy])

  return (
    <div className="max-w-5xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-6">📋 店家清單</h1>
      {loading && <p>讀取中...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && stores.length === 0 && <p>目前沒有店家</p>}

      <table className="w-full border bg-white">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">店名 / 期限</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">電話</th>
            <th className="p-2 text-center">操作</th>
          </tr>
        </thead>
        <tbody>{tableBody}</tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2">＊到期店家列會以淡紅底顯示，並自動停用帳號</p>
    </div>
  )
}
