// pages/admin/dashboard.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'

interface StoreAccount {
  id: string
  email: string
  store_name: string
  is_active: boolean
  created_at: string
  trial_start_at: string | null
  trial_end_at: string | null
  dine_in_enabled: boolean
  takeout_enabled: boolean
}

interface FeatureFlag {
  store_id: string
  feature_key: string
  enabled: boolean
}

type TabKey = 'all' | 'active' | 'expired' | 'blocked'

export default function AdminDashboard() {
  const [stores, setStores] = useState<StoreAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  useEffect(() => {
    void fetchStores()
  }, [])

  const fetchStores = async () => {
    setLoading(true)
    setErr('')
    try {
      const { data: acc, error: accErr } = await supabase
        .from('store_accounts')
        .select('id,email,store_name,is_active,created_at,trial_start_at,trial_end_at')
        .order('created_at', { ascending: false })
      if (accErr) throw accErr

      const { data: flags } = await supabase
        .from('store_feature_flags')
        .select('store_id,feature_key,enabled')

      const flagMap: Record<string, Record<string, boolean>> = {}
      ;(flags as FeatureFlag[]).forEach(f => {
        if (!flagMap[f.store_id]) flagMap[f.store_id] = {}
        flagMap[f.store_id][f.feature_key] = f.enabled
      })

      const merged = (acc ?? []).map(row => {
        const now = new Date()
        const end = row.trial_end_at ? new Date(row.trial_end_at) : null
        return {
          ...row,
          dine_in_enabled: flagMap[row.id]?.['dine_in'] ?? true,
          takeout_enabled: flagMap[row.id]?.['takeout'] ?? true,
          expired: end ? end < now : false,
        }
      }) as StoreAccount[]
      setStores(merged)
    } catch (e: any) {
      console.error('fetchStores error', e)
      setErr(e.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFlag = async (storeId: string, key: 'dine_in' | 'takeout', current: boolean) => {
    setMutatingId(storeId)
    try {
      const { data: upd, error: updErr } = await supabase
        .from('store_feature_flags')
        .update({ enabled: !current })
        .eq('store_id', storeId)
        .eq('feature_key', key)
        .select('store_id')
      if (updErr) throw updErr
      if (!upd || upd.length === 0) {
        const { error: insErr } = await supabase
          .from('store_feature_flags')
          .insert({ store_id: storeId, feature_key: key, enabled: !current })
        if (insErr) throw insErr
      }
      await fetchStores()
    } catch (e: any) {
      setErr(e.message || '更新失敗')
    } finally {
      setMutatingId(null)
    }
  }

  const handleToggleActive = async (id: string, current: boolean) => {
    setMutatingId(id)
    try {
      const { error } = await supabase.from('store_accounts').update({ is_active: !current }).eq('id', id)
      if (error) throw error
      await fetchStores()
    } catch (e: any) {
      setErr(e.message || '更新失敗')
    } finally {
      setMutatingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個店家帳號嗎？')) return
    setMutatingId(id)
    try {
      const { error } = await supabase.from('store_accounts').delete().eq('id', id)
      if (error) throw error
      await fetchStores()
    } catch (e: any) {
      setErr(e.message || '刪除失敗')
    } finally {
      setMutatingId(null)
    }
  }

  const handleEdit = (s: StoreAccount) => {
    setEditingId(s.id)
    setEditName(s.store_name)
    setEditStart(s.trial_start_at ? s.trial_start_at.substring(0, 10) : '')
    setEditEnd(s.trial_end_at ? s.trial_end_at.substring(0, 10) : '')
  }

  const handleSave = async (id: string) => {
    setMutatingId(id)
    try {
      const { error } = await supabase
        .from('store_accounts')
        .update({
          store_name: editName.trim(),
          trial_start_at: editStart || null,
          trial_end_at: editEnd || null,
        })
        .eq('id', id)
      if (error) throw error
      await fetchStores()
      setEditingId(null)
    } catch (e: any) {
      setErr(e.message || '更新失敗')
    } finally {
      setMutatingId(null)
    }
  }

  const filtered = useMemo(() => {
    const now = new Date()
    return stores.filter(s => {
      if (activeTab === 'all') return true
      if (activeTab === 'active') {
        return !s.trial_end_at || new Date(s.trial_end_at) >= now
      }
      if (activeTab === 'expired') {
        return !!s.trial_end_at && new Date(s.trial_end_at) < now
      }
      if (activeTab === 'blocked') {
        return !s.is_active
      }
      return true
    })
  }, [stores, activeTab])

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      {/* 頁首 */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">📑</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">店家帳號管理</h1>
            <p className="text-white/70 text-sm mt-1">管理店家資訊、期限與功能開關</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={() => void fetchStores()}>重新整理</Button>
          <Button onClick={() => location.href='/admin/new-store'}>➕ 新增店家</Button>
        </div>
      </div>

      {/* 膠囊篩選 */}
      <div className="mb-6">
        <div className="inline-flex overflow-hidden rounded-full shadow ring-1 ring-black/10">
          {[
            { key: 'all', label: '所有名單' },
            { key: 'active', label: '未過期' },
            { key: 'expired', label: '已過期' },
            { key: 'blocked', label: '已封鎖' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as TabKey)}
              className={`px-6 py-2 ${
                activeTab === t.key
                  ? 'bg-yellow-400 text-black font-semibold'
                  : 'bg-white/10 text-white hover:bg-white/20'
              } transition`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 錯誤 / 載入 */}
      {err && <div className="mb-4 rounded border border-red-400/30 bg-red-500/10 text-red-200 p-3">❌ {err}</div>}
      {loading && <div className="mb-4 text-white/80">讀取中…</div>}

      {/* 清單 */}
      <div className="space-y-4">
        {filtered.map(s => {
          const busy = mutatingId === s.id
          const expired = s.trial_end_at ? new Date(s.trial_end_at) < new Date() : false
          return (
            <div key={s.id} className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
              {editingId === s.id ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    className="border px-2 py-1 rounded bg-white text-gray-900"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                  <input
                    type="date"
                    className="border px-2 py-1 rounded bg-white text-gray-900"
                    value={editStart}
                    onChange={e => setEditStart(e.target.value)}
                  />
                  <input
                    type="date"
                    className="border px-2 py-1 rounded bg-white text-gray-900"
                    value={editEnd}
                    onChange={e => setEditEnd(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" disabled={busy} onClick={() => handleSave(s.id)}>儲存</Button>
                    <Button size="sm" variant="soft" onClick={() => setEditingId(null)}>取消</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="font-semibold">{s.store_name}</div>
                    <div className="text-sm text-white/70">{s.email}</div>
                    <div className="text-xs text-white/60 mt-1">
                      期限：{s.trial_start_at ? formatDate(s.trial_start_at) : '—'} ~ {s.trial_end_at ? formatDate(s.trial_end_at) : '—'}
                      {expired && <span className="ml-2 text-red-400 font-semibold">已過期</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs border ${s.is_active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' : 'bg-red-500/15 text-red-300 border-red-400/20'}`}>
                      {s.is_active ? '啟用中' : '已封鎖'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs border ${s.dine_in_enabled ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' : 'bg-red-500/15 text-red-300 border-red-400/20'}`}>
                      內用 {s.dine_in_enabled ? '開啟' : '封鎖'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs border ${s.takeout_enabled ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' : 'bg-red-500/15 text-red-300 border-red-400/20'}`}>
                      外帶 {s.takeout_enabled ? '開啟' : '封鎖'}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="soft" disabled={busy} onClick={() => handleEdit(s)}>編輯</Button>
                    <Button size="sm" variant="soft" disabled={busy} onClick={() => handleToggleFlag(s.id, 'dine_in', s.dine_in_enabled)}>
                      {s.dine_in_enabled ? '封鎖內用' : '解除內用'}
                    </Button>
                    <Button size="sm" variant="soft" disabled={busy} onClick={() => handleToggleFlag(s.id, 'takeout', s.takeout_enabled)}>
                      {s.takeout_enabled ? '封鎖外帶' : '解除外帶'}
                    </Button>
                    <Button size="sm" variant="warning" disabled={busy} onClick={() => handleToggleActive(s.id, s.is_active)}>
                      {s.is_active ? '停用帳號' : '啟用帳號'}
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => handleDelete(s.id)}>刪除</Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
