// pages/admin/dashboard.tsx
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import ConfirmPasswordModal from '@/components/ui/ConfirmPasswordModal'

/* =====================
   型別定義
===================== */
interface StoreAccountRow {
  id: string              // 帳號 id（store_accounts 主鍵）
  store_id: string        // 關聯 stores.id（用於 feature flags）
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

/** 介面層資料（合併 flags 與驗證狀態） */
interface StoreView {
  account_id: string
  store_id: string
  email: string
  store_name: string
  is_active: boolean
  created_at: string
  trial_start_at: string | null
  trial_end_at: string | null
  dine_in_enabled: boolean
  takeout_enabled: boolean
  // 新增：驗證狀態
  email_confirmed: boolean
  email_confirmed_at: string | null
}

type TabKey = 'all' | 'active' | 'expired' | 'blocked'

/* =====================
   共用工具：日期/錯誤
===================== */
function getErrorMessage(e: unknown): string {
  if (!e) return '未知錯誤'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  try { return JSON.stringify(e) } catch { return String(e) }
}

function formatYMD(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function isExpired(end: string | null): boolean {
  if (!end) return false
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return false
  const today = new Date()
  endDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return endDate < today
}

/* =====================
   主元件
===================== */
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
  const [editEnd, setEditEnd] = useState<string>('')     // yyyy-MM-dd

  // 操作鎖定
  const [mutatingKey, setMutatingKey] = useState<string | null>(null)

  // 刪除二次確認（管理員密碼）
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ accountId: string; storeId: string } | null>(null)
  const [adminEmail, setAdminEmail] = useState<string>('')

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const email = data?.user?.email ?? ''
      if (email) setAdminEmail(email)
    })
  }, [])

  /* ---------------------
     讀取 accounts + flags（務必帶 store_id）
  --------------------- */
  const fetchStores = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      // 1) store_accounts
      const { data: acc, error: accErr } = await supabase
        .from('store_accounts')
        .select('id, store_id, email, store_name, is_active, created_at, trial_start_at, trial_end_at')
        .order('created_at', { ascending: false })
      if (accErr) throw accErr
      const accounts = (acc ?? []) as StoreAccountRow[]

      // 2) flags
      const { data: flg, error: flagErr } = await supabase
        .from('store_feature_flags')
        .select('store_id, feature_key, enabled')
      if (flagErr) {
        console.warn('read store_feature_flags failed, fallback to defaults', flagErr)
      }
      const flags = (flg ?? []) as StoreFeatureFlagRow[]

      // 3) 合併（先不含驗證）
      const mergedBase = accounts.map<StoreView>((a) => {
        const dine = flags.find((f) => f.store_id === a.store_id && f.feature_key === 'dine_in')
        const take = flags.find((f) => f.store_id === a.store_id && f.feature_key === 'takeout')
        return {
          account_id: a.id,
          store_id: a.store_id,
          email: a.email,
          store_name: a.store_name,
          is_active: a.is_active,
          created_at: a.created_at,
          trial_start_at: a.trial_start_at,
          trial_end_at: a.trial_end_at,
          dine_in_enabled: dine?.enabled ?? true,
          takeout_enabled: take?.enabled ?? true,
          email_confirmed: false,          // 先預設
          email_confirmed_at: null,
        }
      })

      // 4) 取得驗證狀態（新增）
      const emails = mergedBase.map((r) => r.email)
      const resp = await fetch('/api/admin/user-confirmations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      if (!resp.ok) {
        console.warn('user-confirmations failed', await resp.text())
      } else {
        const j = await resp.json()
        const map = new Map<string, { confirmed: boolean; email_confirmed_at: string | null }>()
        ;(j.rows as any[]).forEach((row) =>
          map.set(String(row.email).toLowerCase(), {
            confirmed: Boolean(row.confirmed),
            email_confirmed_at: row.email_confirmed_at ?? null,
          })
        )
        mergedBase.forEach((r) => {
          const m = map.get(r.email.toLowerCase())
          if (m) {
            r.email_confirmed = m.confirmed
            r.email_confirmed_at = m.email_confirmed_at
          }
        })
      }

      setStores(mergedBase)
    } catch (e) {
      setErr(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStores() }, [fetchStores])

  /* ---------------------
     flags upsert（update→insert）
  --------------------- */
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

  /* ---------------------
     互動動作（flags / 啟用 / 刪除 / 編輯）
  --------------------- */
  const toggleDineIn = async (storeId: string, current: boolean) => {
    setMutatingKey(`dine:${storeId}`)
    setErr('')
    try {
      await upsertFlag(storeId, 'dine_in', !current)
      await fetchStores()
    } catch (e) {
      setErr(getErrorMessage(e))
    } finally {
      setMutatingKey(null)
    }
  }

  const toggleTakeout = async (storeId: string, current: boolean) => {
    setMutatingKey(`takeout:${storeId}`)
    setErr('')
    try {
      await upsertFlag(storeId, 'takeout', !current)
      await fetchStores()
    } catch (e) {
      setErr(getErrorMessage(e))
    } finally {
      setMutatingKey(null)
    }
  }

  const toggleActive = async (accountId: string, current: boolean) => {
    setMutatingKey(`active:${accountId}`)
    setErr('')
    try {
      const { error } = await supabase
        .from('store_accounts')
        .update({ is_active: !current })
        .eq('id', accountId)
      if (error) throw error
      await fetchStores()
    } catch (e) {
      setErr(getErrorMessage(e))
    } finally {
      setMutatingKey(null)
    }
  }

  const requestDelete = (accountId: string, storeId: string) => {
    setPendingDelete({ accountId, storeId })
    setShowDeleteModal(true)
  }

  const confirmDeleteWithPassword = async (password: string) => {
    if (!pendingDelete || !adminEmail) {
      setShowDeleteModal(false)
      return
    }
    const { accountId, storeId } = pendingDelete
    setMutatingKey(`delete:${accountId}`)
    setErr('')
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password,
      })
      if (loginError) throw loginError

      const { error: delFlagErr } = await supabase
        .from('store_feature_flags')
        .delete()
        .eq('store_id', storeId)
      if (delFlagErr) throw delFlagErr

      const { error: delAccErr } = await supabase
        .from('store_accounts')
        .delete()
        .eq('id', accountId)
      if (delAccErr) throw delAccErr

      setShowDeleteModal(false)
      setPendingDelete(null)
      await fetchStores()
    } catch (e) {
      setErr(getErrorMessage(e))
    } finally {
      setMutatingKey(null)
    }
  }

  // 編輯：店名＋期限
  const startEdit = (row: StoreView) => {
    setEditingId(row.account_id)
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
  const saveEdit = async (accountId: string) => {
    setMutatingKey(`save:${accountId}`)
    setErr('')
    try {
      const payload = {
        store_name: editName.trim(),
        trial_start_at: editStart || null,
        trial_end_at: editEnd || null,
      }
      const { error } = await supabase
        .from('store_accounts')
        .update(payload)
        .eq('id', accountId)
      if (error) throw error
      await fetchStores()
      cancelEdit()
    } catch (e) {
      setErr(getErrorMessage(e))
    } finally {
      setMutatingKey(null)
    }
  }

  /* ---------------------
     重寄驗證信（呼叫 /api/auth-resend-signup）
  --------------------- */
  const resendSignupEmail = async (email: string) => {
    setMutatingKey(`resend:${email}`)
    setErr('')
    try {
      const resp = await fetch('/api/auth-resend-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/auth/callback`,
        }),
      })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j?.error || '重寄失敗')
      // 成功後重新抓一次（若使用者在此刻完成驗證，下一次刷新就會看到已驗證）
      await fetchStores()
      alert('✅ 已請求重寄驗證信')
    } catch (e) {
      alert(`❌ 重寄失敗：${getErrorMessage(e)}`)
    } finally {
      setMutatingKey(null)
    }
  }

  /* ---------------------
     前端篩選（膠囊 + 關鍵字）
  --------------------- */
  const filtered = useMemo(() => {
    const now = new Date()
    const kw = keyword.trim().toLowerCase()
    return stores.filter((s) => {
      if (activeTab === 'active') {
        if (s.trial_end_at) {
          const end = new Date(s.trial_end_at)
          if (!Number.isNaN(end.getTime()) && end < now) return false
        }
      } else if (activeTab === 'expired') {
        if (!(s.trial_end_at && new Date(s.trial_end_at) < now)) return false
      } else if (activeTab === 'blocked') {
        if (s.is_active) return false
      }
      if (!kw) return true
      return (s.store_name ?? '').toLowerCase().includes(kw) || (s.email ?? '').toLowerCase().includes(kw)
    })
  }, [stores, activeTab, keyword])

  /* ---------------------
     UI（深色基調）
  --------------------- */
  const RefreshIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 12a8 8 0 10-2.34 5.66M20 12v5h-5" />
    </svg>
  )

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
        {/* 頁首 */}
        <div className="flex items-start justify-between pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 text-2xl">📑</div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">店家帳號管理</h1>
              <p className="text-white/70 text-sm mt-1">管理店家資訊、期限、驗證狀態與內用/外帶功能</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="soft" size="sm" onClick={() => void fetchStores()} startIcon={<RefreshIcon />}>
              重新整理
            </Button>
            <Link href="/admin/new-store">
              <Button type="button">➕ 新增店家</Button>
            </Link>
          </div>
        </div>

        {/* 膠囊導覽 + 搜尋列 */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex overflow-hidden rounded-full shadow ring-1 ring-black/10">
            {([
              { key: 'all', label: '所有名單' },
              { key: 'active', label: '未過期' },
              { key: 'expired', label: '已過期' },
              { key: 'blocked', label: '已封鎖' },
            ] as { key: TabKey; label: string }[]).map((t) => (
              <button
                key={t.key}
                type="button"
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

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋店名或 Email"
            className="w-[280px] sm:w-[360px] h-10 rounded-full bg-white/10 text-white placeholder:text-white/50 px-4 outline-none border border-white/10 focus:border-white/30"
          />
        </div>

        {/* 錯誤 / 載入 */}
        {err && <div className="mb-4 rounded border border-red-400/30 bg-red-500/10 text-red-200 p-3">❌ {err}</div>}
        {loading && <div className="mb-4 text-white/80">讀取中…</div>}

        {/* 清單卡片 */}
        <div className="space-y-4">
          {filtered.map((s) => {
            const busy =
              mutatingKey?.includes(s.account_id) ||
              mutatingKey?.includes(s.store_id) ||
              mutatingKey === `resend:${s.email}`
            const expired = isExpired(s.trial_end_at)

            return (
              <div
                key={s.account_id}
                className="relative bg-[#2B2B2B] text-white rounded-xl shadow-sm border border-white/10 px-5 py-4"
              >
                {editingId === s.account_id ? (
                  // 編輯模式：店名 + 期限
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-4">
                      <label className="block text-xs text-white/60 mb-1">店名</label>
                      <input
                        className="w-full border px-3 py-2 rounded bg-white text-gray-900"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="店名"
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="block text-xs text-white/60 mb-1">開始日</label>
                      <input
                        type="date"
                        className="w-full border px-3 py-2 rounded bg-white text-gray-900"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="block text-xs text-white/60 mb-1">結束日</label>
                      <input
                        type="date"
                        className="w-full border px-3 py-2 rounded bg-white text-gray-900"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                      />
                    </div>
                    <div className="lg:col-span-2 flex items-end gap-2">
                      <Button type="button" size="sm" variant="success" disabled={!!busy} onClick={() => void saveEdit(s.account_id)}>
                        儲存
                      </Button>
                      <Button type="button" size="sm" variant="soft" disabled={!!busy} onClick={cancelEdit}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  // 顯示模式
                  <div className="space-y-3">
                    {/* 上：店名/Email + 期限 */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                      <div className="pointer-events-none md:pointer-events-auto">
                        <div className="font-semibold text-base md:text-lg">{s.store_name}</div>
                        <div className="text-sm text-white/70">{s.email}</div>
                      </div>
                      <div className="text-xs text-white/70 pointer-events-none">
                        期限：{formatYMD(s.trial_start_at)} ~ {formatYMD(s.trial_end_at)}
                        {expired && <span className="ml-2 text-red-400 font-semibold">已過期</span>}
                      </div>
                    </div>

                    {/* 中：狀態徽章（帳號 / 內用 / 外帶 / 驗證） */}
                    <div className="flex gap-2 flex-wrap">
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

                      {/* 新增：驗證狀態 badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-xs border ${
                          s.email_confirmed
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
                            : 'bg-yellow-500/15 text-yellow-200 border-yellow-400/20'
                        }`}
                        title={s.email_confirmed ? 'Email 已驗證' : 'Email 未驗證'}
                      >
                        {s.email_confirmed ? '已驗證' : '未驗證'}
                      </span>
                    </div>

                    {/* 下：操作按鈕群（含重寄驗證信） */}
                    <div className="flex gap-2 flex-wrap relative z-10 pointer-events-auto">
                      {!s.email_confirmed && (
                        <Button
                          type="button"
                          size="sm"
                          variant="soft"
                          disabled={!!busy}
                          onClick={() => resendSignupEmail(s.email)}
                          title="重寄註冊確認信"
                        >
                          重寄驗證信
                        </Button>
                      )}

                      <Button type="button" size="sm" variant="soft" disabled={!!busy} onClick={() => startEdit(s)}>
                        編輯
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="soft"
                        disabled={!!busy}
                        onClick={() => toggleDineIn(s.store_id, s.dine_in_enabled)}
                      >
                        {s.dine_in_enabled ? '封鎖內用' : '解除內用'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="soft"
                        disabled={!!busy}
                        onClick={() => toggleTakeout(s.store_id, s.takeout_enabled)}
                      >
                        {s.takeout_enabled ? '封鎖外帶' : '解除外帶'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="warning"
                        disabled={!!busy}
                        onClick={() => toggleActive(s.account_id, s.is_active)}
                      >
                        {s.is_active ? '停用帳號' : '啟用帳號'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={!!busy}
                        onClick={() => requestDelete(s.account_id, s.store_id)}
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

      {/* 刪除二次確認（輸入管理員密碼） */}
      {showDeleteModal && (
        <ConfirmPasswordModal
          onCancel={() => {
            setShowDeleteModal(false)
            setPendingDelete(null)
          }}
          onConfirm={confirmDeleteWithPassword}
        />
      )}
    </main>
  )
}
