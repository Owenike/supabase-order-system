// pages/admin/dashboard.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import type { User } from '@supabase/supabase-js'

/** 店家帳號（store_accounts） */
interface StoreAccountRow {
  id: string
  email: string
  store_name: string
  is_active: boolean
  created_at: string
}

/** 功能旗標（store_feature_flags） */
interface StoreFeatureFlagRow {
  store_id: string
  feature_key: 'dine_in' | 'takeout' | string
  enabled: boolean
}

/** 前端使用的合併型別（含兩個旗標） */
interface StoreAccountView extends StoreAccountRow {
  dine_in_enabled: boolean
  takeout_enabled: boolean
}

/** type guard */
function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string')
}

/** 從 user 取角色 */
function extractRoleFromUser(user: User): { metaRole?: string; appRoles?: string[] } {
  const metaRoleRaw = (user.user_metadata as Record<string, unknown> | null)?.role
  const metaRole = typeof metaRoleRaw === 'string' ? metaRoleRaw : undefined
  const appRolesRaw = (user.app_metadata as Record<string, unknown> | null)?.roles
  const appRoles = isStringArray(appRolesRaw) ? appRolesRaw : undefined
  return { metaRole, appRoles }
}

/** email 是否驗證 */
function isEmailConfirmed(user: User): boolean {
  const anyUser = user as unknown as Record<string, unknown>
  const confirmedA = Boolean((user as unknown as { email_confirmed_at?: string | null }).email_confirmed_at)
  const confirmedB = Boolean((anyUser?.['confirmed_at'] as string | null) ?? null)
  return confirmedA || confirmedB
}

export default function AdminDashboard() {
  const router = useRouter()

  // Auth 狀態
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // 資料與 UI 狀態
  const [stores, setStores] = useState<StoreAccountView[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [errMsg, setErrMsg] = useState<string>('')

  // 行內編輯
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState<string>('')
  const [editStoreName, setEditStoreName] = useState<string>('')

  // 進行中操作鎖定
  const [mutatingId, setMutatingId] = useState<string | null>(null)

  /** Admin 驗證（安全處理 user.email） */
  const checkAdmin = useCallback(async (): Promise<boolean> => {
    const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr || !sessionRes.session) return false

    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes?.user) return false

    const user = userRes.user
    const email = (user.email ?? '').trim()
    if (!email) return false
    if (!isEmailConfirmed(user)) return false

    const { metaRole, appRoles } = extractRoleFromUser(user)
    if (metaRole === 'admin') return true
    if (appRoles?.includes('admin')) return true

    // 可選：white-list 表
    try {
      const { data: row, error } = await supabase
        .from('platform_admins')
        .select('email')
        .eq('email', email.toLowerCase())
        .maybeSingle()
      if (!error && row?.email) return true
    } catch {
      /* 無此表/RLS 略過 */
    }
    return false
  }, [])

  /** 讀取列表（store_accounts + store_feature_flags 合併） */
  const fetchStores = useCallback(async () => {
    setLoading(true)
    setErrMsg('')

    // 1) 取 store_accounts
    const { data: accounts, error: accErr } = await supabase
      .from('store_accounts')
      .select('id,email,store_name,is_active,created_at')
      .order('created_at', { ascending: false })

    if (accErr) {
      console.error('載入 store_accounts 失敗', accErr)
      setErrMsg('載入失敗，請稍後再試')
      setStores([])
      setLoading(false)
      return
    }

    const accList = (accounts ?? []) as StoreAccountRow[]
    if (accList.length === 0) {
      setStores([])
      setLoading(false)
      return
    }

    // 2) 取 store_feature_flags（只抓 dine_in / takeout）
    const { data: flags, error: flagErr } = await supabase
      .from('store_feature_flags')
      .select('store_id,feature_key,enabled')

    if (flagErr) {
      // 若旗標表查詢失敗，不阻斷流程：用預設 true
      console.warn('讀取 store_feature_flags 失敗，改用預設 true', flagErr)
    }

    const flagsList = (flags ?? []) as StoreFeatureFlagRow[]

    // 3) 合併
    const merged: StoreAccountView[] = accList.map((acc) => {
      const dine = flagsList.find((f) => f.store_id === acc.id && f.feature_key === 'dine_in')
      const take = flagsList.find((f) => f.store_id === acc.id && f.feature_key === 'takeout')
      return {
        ...acc,
        dine_in_enabled: dine?.enabled ?? true,
        takeout_enabled: take?.enabled ?? true,
      }
    })

    setStores(merged)
    setLoading(false)
  }, [])

  /** 初始化 */
  useEffect(() => {
    let mounted = true
    const run = async () => {
      const ok = await checkAdmin()
      if (!mounted) return
      setIsAdmin(ok)
      setAuthChecked(true)
      if (!ok) {
        const next = encodeURIComponent('/admin/dashboard')
        router.replace(`/admin/login?next=${next}`)
        return
      }
      await fetchStores()
    }
    run()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/admin/login')
    })
    return () => {
      mounted = false
      try {
        sub.subscription.unsubscribe()
      } catch {}
    }
  }, [checkAdmin, fetchStores, router])

  /** 進入行內編輯 */
  const startEdit = (row: StoreAccountView) => {
    setEditingId(row.id)
    setEditEmail(row.email ?? '')
    setEditStoreName(row.store_name ?? '')
  }

  /** 取消編輯 */
  const cancelEdit = () => {
    setEditingId(null)
    setEditEmail('')
    setEditStoreName('')
  }

  /** 儲存編輯（email / store_name） */
  const saveEdit = async (id: string) => {
    setMutatingId(id)
    setErrMsg('')

    const payload: Partial<StoreAccountRow> = {
      email: (editEmail || '').trim(),
      store_name: (editStoreName || '').trim(),
    }

    const { error } = await supabase.from('store_accounts').update(payload).eq('id', id)

    if (error) {
      console.error('更新店家資料失敗', error.message)
      setErrMsg('更新店家資料失敗，請稍後再試')
    } else {
      await fetchStores()
      cancelEdit()
    }
    setMutatingId(null)
  }

  /** 啟用 / 停用帳號（store_accounts） */
  const toggleActive = async (id: string, current: boolean) => {
    setMutatingId(id)
    setErrMsg('')
    const { error } = await supabase.from('store_accounts').update({ is_active: !current }).eq('id', id)
    if (error) {
      console.error('更新失敗', error.message)
      setErrMsg('更新失敗，請稍後再試')
    } else {
      await fetchStores()
    }
    setMutatingId(null)
  }

  /**
   * 切換旗標（store_feature_flags）
   * 流程：先 update（eq store_id & feature_key），若 0 筆 → insert（新建旗標）
   */
  const upsertFeatureFlag = async (
    storeId: string,
    featureKey: 'dine_in' | 'takeout',
    nextEnabled: boolean
  ): Promise<void> => {
    // 先 update
    const { data: updData, error: updErr } = await supabase
      .from('store_feature_flags')
      .update({ enabled: nextEnabled })
      .eq('store_id', storeId)
      .eq('feature_key', featureKey)
      .select('store_id') // 取回受影響筆數
    if (updErr) {
      // 若 update 直接出錯，嘗試 insert（多半是無 RLS 或者沒權限，這種情況仍會錯）
      const { error: insErr } = await supabase.from('store_feature_flags').insert({
        store_id: storeId,
        feature_key: featureKey,
        enabled: nextEnabled,
      })
      if (insErr) throw insErr
      return
    }
    // 若沒有任何列被改到（長度 0）→ 插入
    if (!updData || updData.length === 0) {
      const { error: insErr } = await supabase.from('store_feature_flags').insert({
        store_id: storeId,
        feature_key: featureKey,
        enabled: nextEnabled,
      })
      if (insErr) throw insErr
    }
  }

  /** 封鎖 / 解除 內用（store_feature_flags） */
  const toggleDineIn = async (storeId: string, currentEnabled: boolean) => {
    setMutatingId(storeId)
    setErrMsg('')
    try {
      await upsertFeatureFlag(storeId, 'dine_in', !currentEnabled)
      await fetchStores()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('更新內用狀態失敗', msg)
      setErrMsg('更新內用狀態失敗，請稍後再試')
    } finally {
      setMutatingId(null)
    }
  }

  /** 封鎖 / 解除 外帶（store_feature_flags） */
  const toggleTakeout = async (storeId: string, currentEnabled: boolean) => {
    setMutatingId(storeId)
    setErrMsg('')
    try {
      await upsertFeatureFlag(storeId, 'takeout', !currentEnabled)
      await fetchStores()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('更新外帶狀態失敗', msg)
      setErrMsg('更新外帶狀態失敗，請稍後再試')
    } finally {
      setMutatingId(null)
    }
  }

  /** 刪除帳號（不可復原） */
  const deleteStore = async (id: string) => {
    if (!window.confirm('確定要刪除這個店家帳號嗎？此操作無法復原。')) return
    setMutatingId(id)
    setErrMsg('')
    const { error } = await supabase.from('store_accounts').delete().eq('id', id)
    if (error) {
      console.error('刪除失敗', error.message)
      setErrMsg('刪除失敗，請稍後再試')
    } else {
      await fetchStores()
    }
    setMutatingId(null)
  }

  // 尚未完成身份檢查 → 安靜載入
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center text-white/70">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/50 border-t-transparent mr-3" />
        <span>載入中…</span>
      </div>
    )
  }
  if (!isAdmin) return null

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white px-6 py-8">
      <div className="max-w-6xl mx-auto">
        {/* 頁首 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📑</div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">店家帳號管理</h1>
          </div>
        <button
            onClick={() => router.push('/admin/new-store')}
            className="px-4 py-2 rounded bg-amber-400 text-black font-semibold hover:bg-amber-500 transition"
          >
            ➕ 新增店家
          </button>
        </div>

        {errMsg && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-600/20 text-red-200 px-3 py-2 text-sm">
            {errMsg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center text-white/70">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/50 border-t-transparent mr-2" />
            讀取中…
          </div>
        ) : stores.length === 0 ? (
          <div className="text-white/70">目前沒有任何店家帳號。</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/80">
                <tr>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">店名</th>
                  <th className="text-left px-4 py-2">帳號</th>
                  <th className="text-left px-4 py-2">內用</th>
                  <th className="text-left px-4 py-2">外帶</th>
                  <th className="text-left px-4 py-2">建立時間</th>
                  <th className="text-left px-4 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {stores.map((s) => {
                  const isRowEditing = editingId === s.id
                  const busy = mutatingId === s.id
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2">
                        {isRowEditing ? (
                          <input
                            className="border px-2 py-1 rounded bg-white text-gray-900 w-64"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                          />
                        ) : (
                          s.email
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isRowEditing ? (
                          <input
                            className="border px-2 py-1 rounded bg-white text-gray-900 w-48"
                            value={editStoreName}
                            onChange={(e) => setEditStoreName(e.target.value)}
                          />
                        ) : (
                          s.store_name
                        )}
                      </td>
                      <td className="px-4 py-2">{s.is_active ? '✅ 啟用' : '⛔ 停用'}</td>
                      <td className="px-4 py-2">{s.dine_in_enabled ? '🟢 開啟' : '🔴 封鎖'}</td>
                      <td className="px-4 py-2">{s.takeout_enabled ? '🟢 開啟' : '🔴 封鎖'}</td>
                      <td className="px-4 py-2">
                        {new Date(s.created_at).toLocaleString('zh-TW', { hour12: false })}
                      </td>
                      <td className="px-4 py-2 space-x-2">
                        {isRowEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(s.id)}
                              disabled={busy}
                              className="text-xs px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-60"
                            >
                              儲存
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={busy}
                              className="text-xs px-3 py-1 rounded bg-slate-600 text-white disabled:opacity-60"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(s)}
                              disabled={busy}
                              className="text-xs px-3 py-1 rounded bg-indigo-500 text-white disabled:opacity-60"
                            >
                              編輯
                            </button>
                            <button
                              onClick={() => toggleDineIn(s.id, s.dine_in_enabled)}
                              disabled={busy}
                              className="text-xs px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-60"
                            >
                              {s.dine_in_enabled ? '封鎖內用' : '解除內用'}
                            </button>
                            <button
                              onClick={() => toggleTakeout(s.id, s.takeout_enabled)}
                              disabled={busy}
                              className="text-xs px-3 py-1 rounded bg-teal-600 text-white disabled:opacity-60"
                            >
                              {s.takeout_enabled ? '封鎖外帶' : '解除外帶'}
                            </button>
                            <button
                              onClick={() => toggleActive(s.id, s.is_active)}
                              disabled={busy}
                              className="text-xs px-3 py-1 rounded bg-yellow-500 text-black disabled:opacity-60"
                            >
                              {s.is_active ? '停用帳號' : '啟用帳號'}
                            </button>
                            <button
                              onClick={() => deleteStore(s.id)}
                              disabled={busy}
                              className="text-xs px-3 py-1 rounded bg-red-600 text-white disabled:opacity-60"
                            >
                              刪除
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
