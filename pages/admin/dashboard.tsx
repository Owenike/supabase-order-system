// pages/admin/dashboard.tsx
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'

/** ---- 型別 ---- */
interface StoreAccountRow {
  id: string
  email: string
  store_name: string
  is_active: boolean
  created_at: string
  trial_start_at: string | null
  trial_end_at: string | null
}

interface StoreFeatureFlagRow {
  store_id: string
  feature_key: 'dine_in' | 'takeout' | string
  enabled: boolean
}

interface StoreView extends StoreAccountRow {
  dine_in_enabled: boolean
  takeout_enabled: boolean
}

type TabKey = 'all' | 'active' | 'expired' | 'blocked'

/** ---- 工具 ---- */
const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'

const isExpired = (end: string | null): boolean => {
  if (!end) return false
  const endDate = new Date(end)
  const today = new Date()
  endDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return endDate < today
}

export default function AdminDashboard() {
  // 資料
  const [stores, setStores] = useState<StoreView[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [err, setErr] = useState<string>('')

  // 篩選與搜尋
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [keyword, setKeyword] = useState<string>('')

  // 行內編輯
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editStart, setEditStart] = useState<string>('') // yyyy-MM-dd
  const [editEnd, setEditEnd] = useState<string>('')

  // 操作鎖定
  const [mutatingId, setMutatingId] = useState<string | null>(null)

  /** 讀取 store_accounts + store_feature_flags，合併為 StoreView */
  const fetchStores = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      // 1) store_accounts
      const { data: acc, error: accErr } = await supabase
        .from('store_accounts')
        .select('id,email,store_name,is_active,created_at,trial_start_at,trial_end_at')
        .order('created_at', { ascending: false })
      if (accErr) throw accErr
      const accounts = (acc ?? []) as StoreAccountRow[]

      if (accounts.length === 0) {
        setStores([])
        return
      }

      // 2) store_feature_flags
      const { data: flg, error: flagErr } = await supabase
        .from('store_feature_flags')
        .select('store_id,feature_key,enabled')
      if (flagErr) {
        // 旗標表讀不到時，不中斷流程：預設開啟
        console.warn('read store_feature_flags failed, fallback to defaults', flagErr)
      }
      const flags = (flg ?? []) as StoreFeatureFlagRow[]

      // 3) 合併
      const merged: StoreView[] = accounts.map((a) => {
        const dine = flags.find((f) => f.store_id === a.id && f.feature_key === 'dine_in')
        const take = flags.find((f) => f.store_id === a.id && f.feature_key === 'takeout')
        return {
          ...a,
          dine_in_enabled: dine?.enabled ?? true,
          takeout_enabled: take?.enabled ?? true,
        }
      })

      setStores(merged)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('fetchStores error:', msg)
      setErr(msg || '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStores()
  }, [fetchStores])

  /** 更新 flags：先 update，受影響 0 筆則 insert */
  const upsertFlag = useCallback(
    async (storeId: string, key: 'dine_in' | 'takeout', nextEnabled: boolean) => {
      const { data: upd, error: updErr } = await supabase
        .from('store_feature_flags')
        .update({ enabled: nextEnabled })
        .eq('store_id', storeId)
        .eq('feature_key', key)
        .select('store_id')
      if (updErr) {
        const { error: insErr } = await supabase
          .from('store_feature_flags')
          .insert({ store_id: storeId, feature_key: key, enabled: nextEnabled })
        if (insErr) throw insErr
        return
      }
      if (!upd || upd.length === 0) {
        const { error: insErr } = await supabase
          .from('store_feature_flags')
          .insert({ store_id: storeId, feature_key: key, enabled: nextEnabled })
        if (insErr) throw insErr
      }
    },
    []
  )

  /** 動作：封鎖/解除 內用 */
  const toggleDineIn = async (storeId: string, current: boolean) => {
    setMutatingId(storeId)
    setErr('')
    try {
      await upsertFlag(storeId, 'dine_in', !current)
      await fetchStores()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg || '更新內用狀態失敗')
    } finally {
      setMutatingId(null)
    }
  }

  /** 動作：封鎖/解除 外帶 */
  const toggleTakeout = async (storeId: string, current: boolean) => {
    setMutatingId(storeId)
    setErr('')
    try {
      await upsertFlag(storeId, 'takeout', !current)
      await fetchStores()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg || '更新外帶狀態失敗')
    } finally {
      setMutatingId(null)
    }
  }

  /** 動作：啟用/停用 帳號 */
  const toggleActive = async (id: string, current: boolean) => {
    setMutatingId(id)
    setErr('')
    try {
      const { error } = await supabase.from('store_accounts').update({ is_active: !current }).eq('id', id)
      if (error) throw error
      await fetchStores()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg || '更新帳號狀態失敗')
    } finally {
      setMutatingId(null)
    }
  }

  /** 動作：刪除 */
  const deleteStore = async (id: string) => {
    if (!confirm('確定要刪除這個店家帳號嗎？此操作無法復原。')) return
    setMutatingId(id)
    setErr('')
    try {
      const { error } = await supabase.from('store_accounts').delete().eq('id', id)
      if (error) throw error
      await fetchStores()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg || '刪除失敗')
    } finally {
      setMutatingId(null)
    }
  }

  /** 進入編輯列（店名 + 期限） */
  const startEdit = (row: StoreView) => {
    setEditingId(row.id)
    setEditName(row.store_name ?? '')
    setEditStart(row.trial_start_at ? row.trial_start_at.substring(0, 10) : '')
    setEditEnd(row.trial_end_at ? row.trial_end_at.substring(0, 10) : '')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditStart('')
    setEditEnd('')
  }
  const saveEdit = async (id: string) => {
    setMutatingId(id)
    setErr('')
    try {
      const payload = {
        store_name: editName.trim(),
        trial_start_at: editStart || null,
        trial_end_at: editEnd || null,
      }
      const { error } = await supabase.from('store_accounts').update(payload).eq('id', id)
      if (error) throw error
      await fetchStores()
      cancelEdit()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg || '更新失敗')
    } finally {
      setMutatingId(null)
    }
  }

  /** 前端過濾（膠囊 + 關鍵字） */
  const filtered = useMemo(() => {
    const now = new Date()
    const kw = keyword.trim().toLowerCase()
    return stores.filter((s) => {
      if (activeTab === 'active') {
        if (s.trial_end_at && new Date(s.trial_end_at) < now) return false
      } else if (activeTab === 'expired') {
        if (!(s.trial_end_at && new Date(s.trial_end_at) < now)) return false
      } else if (activeTab === 'blocked') {
        if (s.is_active) return false
      }
      if (!kw) return true
      return (s.store_name ?? '').toLowerCase().includes(kw) || (s.email ?? '').toLowerCase().includes(kw)
    })
  }, [stores, activeTab, keyword])

  /** ---- Icons ---- */
  const RefreshIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 12a8 8 0 10-2.34 5.66M20 12v5h-5" />
    </svg>
  )

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      {/* 頁首（同 /store/manage-menus 語感） */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">📑</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">店家帳號管理</h1>
            <p className="text-white/70 text-sm mt-1">管理店家資訊、期限與內用/外帶功能</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={() => void fetchStores()} startIcon={<RefreshIcon />}>
            重新整理
          </Button>
          <Link href="/admin/new-store">
            <Button>➕ 新增店家</Button>
          </Link>
        </div>
      </div>

      {/* 膠囊導覽 + 搜尋列（同一列，間距一致） */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-full shadow ring-1 ring-black/10">
            {([
              { key: 'all', label: '所有名單' },
              { key: 'active', label: '未過期' },
              { key: 'expired', label: '已過期' },
              { key: 'blocked', label: '已封鎖' },
            ] as { key: TabKey; label: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-6 py-2 transition ${
                  activeTab === t.key
                    ? 'bg-yellow-400 text-black font-semibold'
                    : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋店名或 Email"
            className="w-[280px] sm:w-[360px] h-10 rounded-full bg-white text-gray-900 px-4 outline-none border border-black/10"
          />
        </div>
      </div>

      {/* 錯誤 / 載入 */}
      {err && <div className="mb-4 rounded border border-red-400/30 bg-red-500/10 text-red-200 p-3">❌ {err}</div>}
      {loading && <div className="mb-4 text-white/80">讀取中…</div>}

      {/* 清單卡片（輕量深色卡片） */}
      <div className="space-y-4">
        {filtered.map((s) => {
          const busy = mutatingId === s.id
          const expired = isExpired(s.trial_end_at)

          return (
            <div
              key={s.id}
              className="bg-[#2B2B2B] text-white rounded-xl shadow-sm border border-white/10 px-5 py-4"
            >
              {editingId === s.id ? (
                // ---- 編輯模式：店名 + 期限(起/訖) + 儲存/取消 ----
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  {/* 店名 */}
                  <div className="lg:col-span-4">
                    <label className="block text-xs text-white/60 mb-1">店名</label>
                    <input
                      className="w-full border px-3 py-2 rounded bg-white text-gray-900"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="店名"
                    />
                  </div>
                  {/* 期限起 */}
                  <div className="lg:col-span-3">
                    <label className="block text-xs text-white/60 mb-1">開始日</label>
                    <input
                      type="date"
                      className="w-full border px-3 py-2 rounded bg-white text-gray-900"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                    />
                  </div>
                  {/* 期限訖 */}
                  <div className="lg:col-span-3">
                    <label className="block text-xs text-white/60 mb-1">結束日</label>
                    <input
                      type="date"
                      className="w-full border px-3 py-2 rounded bg-white text-gray-900"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                    />
                  </div>
                  {/* 操作 */}
                  <div className="lg:col-span-2 flex items-end gap-2">
                    <Button size="sm" variant="success" disabled={busy} onClick={() => void saveEdit(s.id)}>
                      儲存
                    </Button>
                    <Button size="sm" variant="soft" disabled={busy} onClick={cancelEdit}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                // ---- 顯示模式：三區塊排版 ----
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  {/* 左：店名 / Email */}
                  <div className="lg:col-span-4">
                    <div className="font-semibold text-base lg:text-lg">{s.store_name}</div>
                    <div className="text-sm text-white/70">{s.email}</div>
                  </div>

                  {/* 中：狀態徽章（帳號/內用/外帶） */}
                  <div className="lg:col-span-4 flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-xs border ${
                        s.is_active
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
                          : 'bg-red-500/15 text-red-300 border-red-400/20'
                      }`}
                      title="帳號狀態"
                    >
                      {s.is_active ? '啟用中' : '已封鎖'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs border ${
                        s.dine_in_enabled
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
                          : 'bg-red-500/15 text-red-300 border-red-400/20'
                      }`}
                      title="內用狀態"
                    >
                      內用{s.dine_in_enabled ? '開啟' : '封鎖'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs border ${
                        s.takeout_enabled
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
                          : 'bg-red-500/15 text-red-300 border-red-400/20'
                      }`}
                      title="外帶狀態"
                    >
                      外帶{s.takeout_enabled ? '開啟' : '封鎖'}
                    </span>

                    {/* 期限（置中區顯示，清楚對齊） */}
                    <span className="ml-2 text-xs text-white/70">
                      期限：{fmtDate(s.trial_start_at)} ~ {fmtDate(s.trial_end_at)}
                      {expired && <span className="ml-2 text-red-400 font-semibold">已過期</span>}
                    </span>
                  </div>

                  {/* 右：操作按鈕群 */}
                  <div className="lg:col-span-4 flex items-center justify-start lg:justify-end gap-2 flex-wrap">
                    <Button size="sm" variant="soft" disabled={busy} onClick={() => startEdit(s)}>
                      編輯
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={busy}
                      onClick={() => void toggleDineIn(s.id, s.dine_in_enabled)}
                    >
                      {s.dine_in_enabled ? '封鎖內用' : '解除內用'}
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={busy}
                      onClick={() => void toggleTakeout(s.id, s.takeout_enabled)}
                    >
                      {s.takeout_enabled ? '封鎖外帶' : '解除外帶'}
                    </Button>
                    <Button
                      size="sm"
                      variant="warning"
                      disabled={busy}
                      onClick={() => void toggleActive(s.id, s.is_active)}
                    >
                      {s.is_active ? '停用帳號' : '啟用帳號'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void deleteStore(s.id)}
                    >
                      刪除
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* 無資料時 */}
        {!loading && filtered.length === 0 && (
          <div className="bg-[#2B2B2B] text-white rounded-lg border border-white/10 shadow p-4">
            <p className="text-white/70">沒有符合條件的店家。</p>
          </div>
        )}
      </div>
    </div>
  )
}
