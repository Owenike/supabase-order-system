// pages/admin/store-list.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/router'
import { formatROC, formatROCRange, isExpired } from '@/lib/date'

type Store = {
  id: string
  name: string
  email: string | null
  phone: string | null
  owner_name: string | null
  is_active: boolean
  created_at: string
  trial_start_at: string | null
  trial_end_at: string | null
}

type StoreRow = Store & {
  dine_in_enabled: boolean
  takeout_enabled: boolean
  expired: boolean
}

/** 取得最新 access token（必要時 refresh）並組 headers */
async function getAuthHeaders(): Promise<Record<string, string>> {
  let { data: sess } = await supabase.auth.getSession()
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

/** YYYY-MM-DD -> ISO(當地 00:00) */
function dateToIso(d: string | null | undefined): string | null {
  if (!d) return null
  return new Date(`${d}T00:00:00`).toISOString()
}

/** ISO -> YYYY-MM-DD */
function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch { return '' }
}

type Filter = 'all' | 'in' | 'expired' // 所有清單 / 期限內 / 已過期

export default function StoreListPage() {
  const router = useRouter()
  const [stores, setStores] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // 正在切換的 store_id

  // 篩選狀態
  const [filter, setFilter] = useState<Filter>('all')

  // 編輯彈窗
  const [editing, setEditing] = useState<StoreRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('') // YYYY-MM-DD
  const [editEnd, setEditEnd] = useState('')     // YYYY-MM-DD
  const [savingEdit, setSavingEdit] = useState(false)
  const [editErr, setEditErr] = useState('')

  useEffect(() => {
    const checkSessionAndFetch = async () => {
      setLoading(true)
      setError('')

      // 稍等片刻讓 UI 有 loading 視覺
      await new Promise((r) => setTimeout(r, 150))

      const sessionRes = await supabase.auth.getSession()
      const session = sessionRes.data.session

      if (!session || !sessionIsAdmin(session)) {
        router.replace('/admin/login')
        return
      }

      // 1) 讀 stores（含試用期欄位與負責人）
      const { data: storesData, error: storesErr } = await supabase
        .from('stores')
        .select('id, name, email, phone, owner_name, is_active, created_at, trial_start_at, trial_end_at')
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
          owner_name: s.owner_name ?? null,
          dine_in_enabled: true,   // 先給預設，稍後用 flags 覆蓋
          takeout_enabled: true,   // 先給預設，稍後用 flags 覆蓋
          expired: isExpired(s.trial_end_at),
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
              if ('dine_in' in obj) row.dine_in_enabled = !!(obj as any).dine_in
              if ('takeout' in obj) row.takeout_enabled = !!(obj as any).takeout
            }
          })
        }
      }

      setStores(baseRows)
      setLoading(false)

      // 3) ✅ 自動停用：若已逾期但仍為 is_active=true，呼叫 API 停用（含 401 重試）
      for (const row of baseRows) {
        if (row.expired && row.is_active) {
          try {
            let headers = await getAuthHeaders()
            let resp = await fetch('/api/toggle-store-active', {
              method: 'PATCH',
              headers,
              credentials: 'include',
              body: JSON.stringify({ email: row.email || '', store_id: row.id, is_active: false }),
            })
            if (resp.status === 401) {
              await supabase.auth.refreshSession()
              headers = await getAuthHeaders()
              resp = await fetch('/api/toggle-store-active', {
                method: 'PATCH',
                headers,
                credentials: 'include',
                body: JSON.stringify({ email: row.email || '', store_id: row.id, is_active: false }),
              })
            }
            setStores((prev) =>
              prev.map((s) => (s.id === row.id ? ({ ...s, is_active: false } as StoreRow) : s))
            )
          } catch {}
        }
      }
    }

    void checkSessionAndFetch()
  }, [router])

  // 編輯彈窗
  const openEdit = (row: StoreRow) => {
    setEditing(row)
    setEditName(row.name)
    setEditStart(isoToDateInput(row.trial_start_at))
    setEditEnd(isoToDateInput(row.trial_end_at))
    setEditErr('')
  }

  const saveEdit = async () => {
    if (!editing) return
    setEditErr('')

    const start = editStart?.trim() || ''
    const end = editEnd?.trim() || ''
    if (!editName.trim()) { setEditErr('請輸入店名'); return }
    if (!start || !end)   { setEditErr('請選擇開始日與結束日'); return }
    if (new Date(start).getTime() >= new Date(end).getTime()) {
      setEditErr('結束日需晚於開始日'); return
    }

    setSavingEdit(true)
    try {
      const payload: Partial<Store> = {
        name: editName.trim(),
        trial_start_at: dateToIso(start),
        trial_end_at: dateToIso(end),
      }
      const { error } = await supabase.from('stores').update(payload).eq('id', editing.id)
      if (error) throw error

      setStores((prev) =>
        prev.map((s) =>
          s.id === editing.id
            ? ({
                ...s,
                name: payload.name ?? s.name,
                trial_start_at: payload.trial_start_at ?? s.trial_start_at,
                trial_end_at: payload.trial_end_at ?? s.trial_end_at,
                expired: isExpired((payload.trial_end_at ?? s.trial_end_at) || null),
              } as StoreRow)
            : s
        )
      )
      setEditing(null)
    } catch (e: any) {
      setEditErr(e?.message || '更新失敗')
    } finally {
      setSavingEdit(false)
    }
  }

  // 刪除
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

  // 旗標切換
  const handleToggleDineIn = async (store_id: string) => {
    try {
      setBusy(store_id)
      // 樂觀更新：先反轉
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? ({ ...s, dine_in_enabled: !s.dine_in_enabled } as StoreRow) : s))
      )
      const resp = await apiPost('/api/admin/toggle-dinein', { store_id })
      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || '切換失敗')
      // 以後端回傳為準
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? ({ ...s, dine_in_enabled: !!json.dine_in_enabled } as StoreRow) : s))
      )
    } catch (e: any) {
      alert('❌ 內用開關切換失敗：' + (e?.message || 'Unknown error'))
      // 失敗：把剛才的樂觀更新還原
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? ({ ...s, dine_in_enabled: !s.dine_in_enabled } as StoreRow) : s))
      )
    } finally {
      setBusy(null)
    }
  }

  const handleToggleTakeout = async (store_id: string) => {
    try {
      setBusy(store_id)
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? ({ ...s, takeout_enabled: !s.takeout_enabled } as StoreRow) : s))
      )
      const resp = await apiPost('/api/admin/toggle-takeout', { store_id })
      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) throw new Error(json?.error || '切換失敗')
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? ({ ...s, takeout_enabled: !!json.takeout_enabled } as StoreRow) : s))
      )
    } catch (e: any) {
      alert('❌ 外帶開關切換失敗：' + (e?.message || 'Unknown error'))
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? ({ ...s, takeout_enabled: !s.takeout_enabled } as StoreRow) : s))
      )
    } finally {
      setBusy(null)
    }
  }

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
      setStores((prev) =>
        prev.map((s) => (s.id === store_id ? ({ ...s, is_active: isActive } as StoreRow) : s))
      )
    } catch (e: any) {
      alert('❌ 操作失敗：' + (e?.message || 'Unknown error'))
    }
  }

  // 篩選
  const filtered = useMemo(() => {
    if (filter === 'all') return stores
    if (filter === 'expired') return stores.filter((s) => s.expired)
    return stores.filter((s) => !s.expired) // 期限內
  }, [stores, filter])

  const tableBody = useMemo(() => {
    return filtered.map((store) => {
      const period =
        store.trial_start_at && store.trial_end_at
          ? `（期限${formatROCRange(store.trial_start_at, store.trial_end_at)}）`
          : ''
      return (
        <tr
          key={store.id}
          className={`border-t border-white/10 hover:bg-white/10 transition ${
            store.expired ? 'bg-red-500/10' : 'bg-transparent'
          }`}
        >
          <td className="p-3 align-top">
            <div className="font-semibold text-white">
              {store.name} <span className="text-amber-300">{period}</span>
            </div>
            {!store.is_active && (
              <div className="text-xs text-red-300 mt-0.5">
                已停用{store.expired ? '（試用到期）' : ''}
              </div>
            )}
          </td>
          <td className="p-3 align-top text-white/80">{store.email || '—'}</td>
          <td className="p-3 align-top text-white/80">{store.owner_name || '—'}</td>
          <td className="p-3 align-top text-white/80">{store.phone || '—'}</td>
          <td className="p-3 align-top">
            <div className="flex flex-wrap gap-2 justify-center">
              {/* 編輯（含期限） */}
              <button
                onClick={() => openEdit(store)}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm shadow"
              >
                編輯
              </button>

              {/* 內用開關 */}
              <button
                onClick={() => handleToggleDineIn(store.id)}
                disabled={busy === store.id || !store.is_active}
                className={`px-3 py-1.5 rounded-md text-white text-sm shadow ${
                  store.dine_in_enabled
                    ? 'bg-amber-500 hover:bg-amber-400'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                } ${!store.is_active ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={store.dine_in_enabled ? '目前允許內用，點擊後將封鎖內用' : '目前已封鎖內用，點擊後將啟動內用'}
              >
                {busy === store.id ? '…處理中' : store.dine_in_enabled ? '封鎖內用' : '啟動內用'}
              </button>

              {/* 外帶開關 */}
              <button
                onClick={() => handleToggleTakeout(store.id)}
                disabled={busy === store.id || !store.is_active}
                className={`px-3 py-1.5 rounded-md text-white text-sm shadow ${
                  store.takeout_enabled
                    ? 'bg-sky-600 hover:bg-sky-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                } ${!store.is_active ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={store.takeout_enabled ? '目前允許外帶，點擊後將封鎖外帶' : '目前已封鎖外帶，點擊後將啟動外帶'}
              >
                {busy === store.id ? '…處理中' : store.takeout_enabled ? '封鎖外帶' : '啟動外帶'}
              </button>

              {/* 啟用/暫停 */}
              <button
                onClick={() => handleToggleActive(store.email || '', store.id, !store.is_active)}
                className={`px-3 py-1.5 rounded-md text-white text-sm shadow ${
                  store.is_active ? 'bg-yellow-500 hover:bg-yellow-400' : 'bg-green-600 hover:bg-green-500'
                }`}
                title={store.is_active ? '暫停帳號' : '啟用帳號'}
              >
                {store.is_active ? '暫停' : '啟用'}
              </button>

              {/* 刪除 */}
              <button
                onClick={() => handleDelete(store.email || '', store.id)}
                className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-sm shadow"
              >
                刪除
              </button>
            </div>
          </td>
        </tr>
      )
    })
  }, [filtered, busy])

  return (
    <main className="bg-[#0B0B0B] min-h-screen">
      {/* 玻璃感輸入樣式修正（autofill/placeholder） */}
      <style jsx global>{`
        .glass input,
        .glass select,
        .glass textarea {
          color: #fff !important;
          background-color: rgba(255, 255, 255, 0.07) !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff !important;
        }
        .glass ::placeholder {
          color: rgba(255, 255, 255, 0.55) !important;
        }
        .glass input:focus,
        .glass select:focus,
        .glass textarea:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(245, 193, 7, 0.35);
          border-color: rgba(245, 193, 7, 0.4);
        }
        .glass input:-webkit-autofill {
          -webkit-text-fill-color: #fff !important;
          box-shadow: 0 0 0px 1000px rgba(255,255,255,0.07) inset !important;
          transition: background-color 5000s ease-in-out 0s !important;
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-10">
        <h1 className="text-2xl font-extrabold tracking-wide text-white mb-4">📋 店家清單</h1>

        {/* 篩選膠囊鈕（深色＋玻璃感） */}
        <div className="mb-6">
          <div className="inline-flex rounded-full overflow-hidden shadow border border-white/15 bg-white/5 backdrop-blur-xl">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 text-sm transition ${
                filter === 'all'
                  ? 'bg-amber-400 text-black font-semibold'
                  : 'text-white/85 hover:bg-white/10'
              }`}
            >
              所有清單
            </button>
            <button
              onClick={() => setFilter('in')}
              className={`px-4 py-2 text-sm transition border-l border-white/10 ${
                filter === 'in'
                  ? 'bg-amber-400 text-black font-semibold'
                  : 'text-white/85 hover:bg-white/10'
              }`}
            >
              期限內
            </button>
            <button
              onClick={() => setFilter('expired')}
              className={`px-4 py-2 text-sm transition border-l border-white/10 ${
                filter === 'expired'
                  ? 'bg-amber-400 text-black font-semibold'
                  : 'text-white/85 hover:bg-white/10'
              }`}
            >
              已過期
            </button>
          </div>
        </div>

        {/* 玻璃感卡片表格（寬版 + 可橫向滾動） */}
        <div className="glass rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,.35)] overflow-x-auto">
          {/* 錯誤訊息（紅色小卡） */}
          {error && (
            <div className="px-4 py-3 text-sm text-red-200 bg-red-600/20 border-b border-red-400/30 min-w-[900px]">
              {error}
            </div>
          )}
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-white/5 border-b border-white/10 text-white/80">
              <tr>
                <th className="p-3 text-left">店名 / 期限</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">負責人</th>
                <th className="p-3 text-left">電話</th>
                <th className="p-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-6 text-white/70" colSpan={5}>讀取中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="p-6 text-white/70" colSpan={5}>無資料</td></tr>
              ) : (
                tableBody
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-white/50 mt-3">
          ＊到期店家列會以淡紅底顯示，並自動停用帳號
        </p>
      </div>

      {/* ====== 編輯彈窗（玻璃感卡片＋暗色輸入＋Amber focus） ====== */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="glass w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,.35)] p-6">
            <h2 className="text-lg font-semibold mb-4">編輯店家資訊</h2>

            <label className="block text-sm text-white/70 mb-1">店名</label>
            <input
              className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/15 placeholder-white/50 mb-4"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="店家名稱"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">開始日</label>
                <input
                  type="date"
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/15 placeholder-white/50"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
                {editStart && (
                  <p className="text-xs text-white/60 mt-1">民國：{formatROC(new Date(editStart))}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">結束日</label>
                <input
                  type="date"
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/15 placeholder-white/50"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
                {editEnd && (
                  <p className="text-xs text-white/60 mt-1">民國：{formatROC(new Date(editEnd))}</p>
                )}
              </div>
            </div>

            {editErr && (
              <div className="mt-3 text-sm text-red-200 bg-red-600/20 border border-red-400/30 rounded px-3 py-2">
                {editErr}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-md border border-white/20 text-white/90 hover:bg-white/10"
                onClick={() => setEditing(null)}
                disabled={savingEdit}
              >
                取消
              </button>
              <button
                className="px-4 py-2 rounded-md bg-amber-400 hover:bg-amber-500 text-black font-semibold shadow-[0_6px_20px_rgba(255,193,7,.25)] disabled:opacity-60"
                onClick={saveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
