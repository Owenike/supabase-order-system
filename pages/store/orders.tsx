'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'

type OptionsMap = Record<string, string | string[]>

interface OrderItem {
  name: string
  quantity: number
  price: number
  options?: OptionsMap | null
}
interface Order {
  id: string
  store_id: string
  table_number: string | null
  items: OrderItem[]
  note?: string | null
  spicy_level?: string | null
  status?: 'pending' | 'completed' | string | null
  created_at: string
  line_user_id?: string | null
  total?: number | null
}

type FilterKey = 'all' | 'pending' | 'completed'
type LangKey = 'zh' | 'en'
type RangeKey = 'today' | 'week' | 'custom'
type TableFilter = 'ALL' | 'TAKEOUT' | string

// ---- 小圖示 ----
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 12a8 8 0 10-2.34 5.66M20 12v5h-5" />
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
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 13l4 4L19 7" />
  </svg>
)

// ---- 共用：膠囊按鈕樣式（深色） ----
const pill = (selected: boolean, tone: 'yellow' | 'green' | 'white' | 'gray' = 'yellow') =>
  selected
    ? ({
        yellow: 'bg-yellow-400 text-black border-yellow-400',
        green:  'bg-emerald-600 text-white border-emerald-600',
        white:  'bg-white text-gray-900 border-white',
        gray:   'bg-gray-200 text-gray-900 border-gray-200',
      }[tone])
    : 'bg-white/10 text-white border border-white/15 hover:bg-white/15 transition'

// ---- 工具 ----
const TAKEOUT_VALUE = 'takeout'
const isTakeoutStr = (t: string | null) => {
  const s = String(t ?? '').trim().toLowerCase()
  return s === 'takeout' || s === '外帶' || s === '0'
}

// ---- 選項編輯器（深色版，一般 key/value 用，保留彈性） ----
type OptionRow = { key: string; value: string; isArray: boolean }

function mapOptionsToRows(opts?: OptionsMap | null): OptionRow[] {
  if (!opts) return []
  const out: OptionRow[] = []
  Object.entries(opts).forEach(([k, v]) => {
    if (Array.isArray(v)) out.push({ key: k, value: v.join(','), isArray: true })
    else out.push({ key: k, value: String(v), isArray: false })
  })
  return out
}
function rowsToOptions(rows: OptionRow[]): OptionsMap | null {
  const obj: OptionsMap = {}
  rows.forEach((r) => {
    const key = r.key.trim()
    if (!key) return
    if (r.isArray) {
      const arr = r.value.split(',').map((s) => s.trim()).filter(Boolean)
      obj[key] = arr
    } else {
      obj[key] = r.value.trim()
    }
  })
  return Object.keys(obj).length ? obj : null
}

function OptionEditor({
  rows,
  onChange,
  title,
}: {
  rows: OptionRow[]
  onChange: (next: OptionRow[]) => void
  title?: string
}) {
  const addRow = () => onChange([...rows, { key: '', value: '', isArray: false }])
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx))
  const update = (idx: number, patch: Partial<OptionRow>) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  return (
    <div className="bg-[#2B2B2B] text-white border border-white/10 rounded-lg p-3">
      {title && <h4 className="text-sm font-semibold mb-2">{title}</h4>}
      {rows.length === 0 && <p className="text-sm text-white/60 mb-2">（目前沒有選項，可新增）</p>}
      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-3 rounded px-2 py-1 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder="選項名稱（例：甜度 / 冰塊 / 加料）"
              value={r.key}
              onChange={(e) => update(idx, { key: e.target.value })}
            />
            <input
              className="col-span-7 rounded px-2 py-1 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder={r.isArray ? '多值用逗號分隔：珍珠,椰果' : '值：半糖 / 去冰 / 大杯'}
              value={r.value}
              onChange={(e) => update(idx, { value: e.target.value })}
            />
            <label className="col-span-1 justify-self-start flex items-center gap-1 text-xs text-white/80">
              <input
                type="checkbox"
                checked={r.isArray}
                onChange={(e) => update(idx, { isArray: e.target.checked })}
              />
              多值
            </label>
            <Button size="sm" variant="destructive" className="col-span-1" onClick={() => removeRow(idx)}>
              刪除
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button size="sm" variant="soft" onClick={addRow}>
          新增選項
        </Button>
      </div>
    </div>
  )
}

// ---- 固定選項（甜度/冰塊/容量/加料）操作：直接改 rows 內容 ----
const SWEET_VALUES = ['無糖','微糖','半糖','少糖','全糖']
const ICE_VALUES   = ['去冰','微冰','少冰','正常冰']
const SIZE_VALUES  = ['小杯','中杯','大杯']
const FIXED_KEYS   = ['甜度','冰塊','容量','加料'] as const
type FixedKey = typeof FIXED_KEYS[number]

function getRow(rows: OptionRow[], key: FixedKey) {
  const i = rows.findIndex(r => r.key === key)
  return { idx: i, row: i >= 0 ? rows[i] : undefined }
}
function setRow(rows: OptionRow[], key: FixedKey, value: string | string[]) {
  const { idx } = getRow(rows, key)
  const isArray = Array.isArray(value)
  const text = isArray ? (value as string[]).join(',') : (value as string)
  if (idx >= 0) rows[idx] = { key, value: text, isArray }
  else rows.push({ key, value: text, isArray })
}
function FixedOptionsEditor({
  rows,
  onChange
}: {
  rows: OptionRow[]
  onChange: (next: OptionRow[]) => void
}) {
  const clone = () => rows.map(r => ({ ...r }))
  const { row: sweet } = getRow(rows, '甜度')
  const { row: ice }   = getRow(rows, '冰塊')
  const { row: size }  = getRow(rows, '容量')
  const { row: addon } = getRow(rows, '加料')

  return (
    <div className="bg-[#2B2B2B] text-white border border-white/10 rounded-lg p-3">
      <h4 className="text-sm font-semibold mb-2">固定選項</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/80 mb-1">甜度</label>
          <select
            value={(sweet?.value ?? '').trim()}
            onChange={(e) => {
              const next = clone()
              const v = e.target.value
              if (v) setRow(next, '甜度', v)
              onChange(next)
            }}
            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <option value="">（不修改）</option>
            {SWEET_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-white/80 mb-1">冰塊</label>
          <select
            value={(ice?.value ?? '').trim()}
            onChange={(e) => {
              const next = clone()
              const v = e.target.value
              if (v) setRow(next, '冰塊', v)
              onChange(next)
            }}
            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <option value="">（不修改）</option>
            {ICE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-white/80 mb-1">容量</label>
          <select
            value={(size?.value ?? '').trim()}
            onChange={(e) => {
              const next = clone()
              const v = e.target.value
              if (v) setRow(next, '容量', v)
              onChange(next)
            }}
            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <option value="">（不修改）</option>
            {SIZE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-white/80 mb-1">加料（多值用逗號分隔）</label>
          <input
            value={addon?.value ?? ''}
            onChange={(e) => {
              const next = clone()
              const raw = e.target.value
              if (raw.trim()) setRow(next, '加料', raw.split(',').map(s => s.trim()).filter(Boolean))
              else {
                const i = next.findIndex(r => r.key === '加料')
                if (i >= 0) next.splice(i, 1)
              }
              onChange(next)
            }}
            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
            placeholder="珍珠,椰果"
          />
        </div>
      </div>
    </div>
  )
}

export default function StoreOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [lang, setLang] = useState<LangKey>('zh')
  const [range, setRange] = useState<RangeKey>('today')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const [storeId, setStoreId] = useState<string | null>(null)
  const lastOrderCount = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editItems, setEditItems] = useState<OrderItem[]>([])
  const [editOptionRows, setEditOptionRows] = useState<Record<number, OptionRow[]>>({})
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 鎖背景捲動（開啟 modal 時）
  useEffect(() => {
    const lock = editingOrder || deletingId
    const prev = document.body.style.overflow
    if (lock) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = prev || ''
    return () => { document.body.style.overflow = prev || '' }
  }, [editingOrder, deletingId])

  // 快速篩選：桌號/外帶
  const [tableFilter, setTableFilter] = useState<TableFilter>('ALL')

  // 桌號下拉選項：外帶 + 1..20 + 目前資料中的所有桌號（去重）
  const tableSelectOptions = useMemo(() => {
    const set = new Set<string>()
    set.add(TAKEOUT_VALUE)
    for (let i = 1; i <= 30; i++) set.add(String(i))
    orders.forEach(o => {
      if (!isTakeoutStr(o.table_number)) {
        const t = String(o.table_number ?? '').trim()
        if (t) set.add(t)
      }
    })
    return Array.from(set)
  }, [orders])

  const dict = useMemo(
    () =>
      ({
        zh: {
          title: '訂單管理',
          all: '全部',
          pending: '未處理',
          completed: '已完成',
          complete: '完成訂單',
          table: '桌號',
          takeout: '外帶',
          items: '品項',
          spicy: '辣度',
          note: '備註',
          done: '✅ 已完成',
          noOrders: '目前沒有訂單',
          noPending: '🔔 無未處理訂單',
          today: '今日',
          week: '本週',
          custom: '自訂',
          from: '起始日',
          to: '結束日',
          edit: '修改',
          delete: '刪除',
          saving: '儲存中…',
          save: '儲存變更',
          cancel: '取消',
          status: '狀態',
          status_pending: '未處理',
          status_completed: '已完成',
          addItem: '新增品項',
          itemName: '品名',
          itemQty: '數量',
          confirmDeleteTitle: '確認刪除',
          confirmDeleteText: '此操作將刪除此筆訂單，且無法復原。確定要刪除嗎？',
          confirm: '確認',
          back: '返回',
          editOrder: '修改訂單',
          actions: '操作',
          total: '總金額',
          refresh: '重新整理',
          autoRefresh: '自動刷新',
          loading: '讀取中…',
          error: '讀取失敗，請稍後再試',
          noStore: '尚未取得 store_id，請確認已登入且 localStorage 有 store_id',
          options: '選項',
          quickFilter: '快速篩選',
        },
        en: {
          title: 'Order Management',
          all: 'All',
          pending: 'Pending',
          completed: 'Completed',
          complete: 'Mark Done',
          table: 'Table',
          takeout: 'Takeout',
          items: 'Items',
          spicy: 'Spicy',
          note: 'Note',
          done: '✅ Done',
          noOrders: 'No orders currently',
          noPending: '🔔 No pending orders',
          today: 'Today',
          week: 'This Week',
          custom: 'Custom',
          from: 'From',
          to: 'To',
          edit: 'Edit',
          delete: 'Delete',
          saving: 'Saving…',
          save: 'Save Changes',
          cancel: 'Cancel',
          status: 'Status',
          status_pending: 'Pending',
          status_completed: 'Completed',
          addItem: 'Add Item',
          itemName: 'Name',
          itemQty: 'Qty',
          confirmDeleteTitle: 'Confirm Delete',
          confirmDeleteText: 'This will permanently delete the order. Continue?',
          confirm: 'Confirm',
          back: 'Back',
          editOrder: 'Edit Order',
          actions: 'Actions',
          total: 'Total',
          refresh: 'Refresh',
          autoRefresh: 'Auto Refresh',
          loading: 'Loading…',
          error: 'Failed to load, please try again',
          noStore: 'store_id not found. Please ensure you are logged in and localStorage has store_id.',
          options: 'Options',
          quickFilter: 'Quick Filter',
        },
      }[lang]),
    [lang]
  )

  // 舊資料鍵值中文化（列表顯示）
  const translateOptionPair = (key: string, value: string | string[]): { k: string; v: string } => {
    const toText = (x: any) => String(x ?? '').trim()
    const V = Array.isArray(value) ? value.map(toText) : [toText(value)]
    let k = key
    if (key === 'fixed_sweetness') k = '甜度'
    else if (key === 'fixed_ice') k = '冰塊'
    else if (key === 'fixed_size') k = '容量'
    else if (/^[0-9a-f-]{24,}$/.test(key)) k = '加料'
    return { k, v: V.join('、') }
  }

  const renderOptions = (opts?: OptionsMap | null) => {
    if (!opts || typeof opts !== 'object') return null
    const entries = Object.entries(opts)
    if (!entries.length) return null
    return (
      <ul className="ml-4 list-disc text-white/70">
        {entries.map(([rawK, rawV]) => {
          const { k, v } = translateOptionPair(rawK, rawV as any)
          return <li key={rawK} className="text-sm">{k}：{v}</li>
        })}
      </ul>
    )
  }

  // 允許播放提示音
  useEffect(() => {
    const enableAudio = () => {
      audioRef.current?.play().catch(() => {})
      document.removeEventListener('click', enableAudio)
    }
    document.addEventListener('click', enableAudio, { once: true })
  }, [])

  // 讀 store_id
  useEffect(() => {
    const stored = localStorage.getItem('store_id')
    if (stored) setStoreId(stored)
  }, [])

  // 計算時間窗
  const calcRange = (): { fromIso: string; toIso: string } | null => {
    const now = new Date()
    let start = new Date()
    let end = new Date()
    if (range === 'today') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else if (range === 'week') {
      const day = now.getDay() || 7
      start.setDate(now.getDate() - day + 1)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else {
      if (!startDate || !endDate) return null
      start = new Date(startDate + 'T00:00:00')
      end = new Date(endDate + 'T23:59:59')
    }
    return { fromIso: start.toISOString(), toIso: end.toISOString() }
  }

  // 輪詢
  useEffect(() => {
    if (!storeId) return
    const doFetch = async () => {
      const win = calcRange()
      if (!win) return
      await fetchOrders(storeId, win.fromIso, win.toIso)
    }
    void doFetch()

    if (autoRefresh) {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(doFetch, 3000)
      return () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [storeId, range, startDate, endDate, autoRefresh])

  // 查詢
  const fetchOrders = async (sid: string, fromIso: string, toIso: string) => {
    setLoading(true); setErrorMsg('')
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('store_id', sid)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) { setErrorMsg(error.message); return }
    const list = (data || []) as Order[]
    if (lastOrderCount.current !== null && list.length > (lastOrderCount.current ?? 0)) {
      audioRef.current?.play().catch(() => {})
    }
    lastOrderCount.current = list.length
    setOrders(list)
  }

  const manualRefresh = async () => {
    if (!storeId) return
    const win = calcRange(); if (!win) return
    await fetchOrders(storeId, win.fromIso, win.toIso)
  }

  // 完成訂單
  const handleComplete = async (id: string) => {
    const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', id)
    if (error) { alert('訂單更新失敗，請稍後再試'); return }
    manualRefresh()
  }

  // 編輯（開啟）
  const openEdit = (order: Order) => {
    setEditingOrder({ ...order })
    const localItems = (order.items ?? []).map((i: any) => ({
      name: String(i?.name ?? ''),
      quantity: Number.isFinite(Number(i?.quantity)) ? Math.max(0, Math.floor(Number(i.quantity))) : 0,
      price: Number.isFinite(Number(i?.price)) ? Math.max(0, Number(i.price)) : 0,
      options: i?.options ?? null,
    }))
    setEditItems(localItems)
    const rows: Record<number, OptionRow[]> = {}
    localItems.forEach((it, idx) => { rows[idx] = mapOptionsToRows(it.options ?? null) })
    setEditOptionRows(rows)
  }

  const updateItem = (idx: number, key: 'name' | 'quantity', value: string | number) => {
    setEditItems(prev => {
      const next = [...prev]; const t = { ...next[idx] }
      if (key === 'name') t.name = String(value)
      if (key === 'quantity') { const n = Number(value); t.quantity = Number.isNaN(n) || n < 0 ? 0 : Math.floor(n) }
      next[idx] = t; return next
    })
  }

  const addItem = () => setEditItems(prev => [...prev, { name: '', quantity: 1, price: 0, options: null } as OrderItem])

  const removeItem = (idx: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
    setEditOptionRows(prev => {
      const next = { ...prev }; delete next[idx]
      const rebuilt: Record<number, OptionRow[]> = {}; let j = 0
      Object.keys(prev).map(Number).sort((a,b)=>a-b).forEach(k => { if (k !== idx) rebuilt[j++] = prev[k] })
      return rebuilt
    })
  }

  const setRowsForIndex = (idx: number, rows: OptionRow[]) => setEditOptionRows(prev => ({ ...prev, [idx]: rows }))

  const saveEdit = async () => {
    if (!editingOrder) return
    if (!editingOrder.table_number || !String(editingOrder.table_number).trim()) {
      alert('請輸入桌號（或外帶）'); return
    }

    const cleanedItems = editItems
      .map((i, idx) => {
        const originalPrice = (editingOrder.items?.[idx]?.price ?? i.price) || 0 // 保留原單價
        const options = rowsToOptions(editOptionRows[idx] || [])
        return {
          name: String(i.name || '').trim(),
          quantity: Number.isFinite(Number(i.quantity)) ? Math.max(0, Math.floor(Number(i.quantity))) : 0,
          price: originalPrice,
          ...(options ? { options } : {}),
        }
      })
      .filter(i => i.name && i.quantity > 0)

    const payload: Record<string, any> = {
      table_number: String(editingOrder.table_number).trim(),
      status: ['pending', 'completed'].includes(String(editingOrder.status || '')) ? editingOrder.status : 'pending',
      note: editingOrder.note?.toString().trim() ? editingOrder.note!.toString().trim() : null,
      items: cleanedItems,
    }
    if (editingOrder.spicy_level && editingOrder.spicy_level.toString().trim()) {
      payload.spicy_level = editingOrder.spicy_level.toString().trim()
    }

    setIsSaving(true)
    const { error } = await supabase.from('orders').update(payload).eq('id', editingOrder.id)
    setIsSaving(false)
    if (error) { alert(`儲存失敗：${error.message}`); return }

    setEditingOrder(null); setEditItems([]); setEditOptionRows({}); manualRefresh()
  }

  // 刪除
  const deleteOrder = (id: string) => setDeletingId(id)
  const confirmDelete = async () => {
    if (!deletingId) return
    const { error } = await supabase.from('orders').delete().eq('id', deletingId)
    if (error) { alert('刪除失敗，請稍後再試'); return }
    setDeletingId(null); manualRefresh()
  }

  // 桌號清單（目前查詢結果內）
  const tableOptions = useMemo(() => {
    const map = new Map<string, { key: TableFilter; label: string }>()
    map.set('ALL', { key: 'ALL', label: '全部桌號' })
    map.set('TAKEOUT', { key: 'TAKEOUT', label: '外帶' })
    orders.forEach(o => {
      if (isTakeoutStr(o.table_number)) return
      const raw = String(o.table_number ?? '').trim()
      if (!raw) return
      if (!map.has(raw)) map.set(raw, { key: raw, label: raw })
    })
    return Array.from(map.values())
  }, [orders])

  // 最終篩選
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (filter === 'pending' && order.status === 'completed') return false
      if (filter === 'completed' && order.status !== 'completed') return false
      if (tableFilter === 'ALL') return true
      if (tableFilter === 'TAKEOUT') return isTakeoutStr(order.table_number)
      return String(order.table_number ?? '').trim() === tableFilter
    })
  }, [orders, filter, tableFilter])

  const calcTotal = (o: Order) =>
    typeof o.total === 'number' && !Number.isNaN(o.total)
      ? o.total!
      : (o.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0)

  const displayTable = (t: string | null) => {
    if (!t) return '-'
    const s = String(t).trim().toLowerCase()
    if (s === 'takeout' || s === '外帶' || s === '0') return '外帶'
    return t
  }

  return (
    <main className="bg-background min-h-screen">
      {/* Autofill & 文字顏色補丁（只作用於彈窗） */}
      <style jsx global>{`
        .orders-modal input,
        .orders-modal textarea,
        .orders-modal select,
        .orders-modal option {
          color: #fff !important;
          background-color: #1f1f1f !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff !important;
        }
        .orders-modal ::placeholder { color: rgba(255,255,255,.4) !important; }
        .orders-modal select option { background: #1f1f1f !important; color:#fff !important; }
      `}</style>

      <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
        <audio ref={audioRef} src="/ding.mp3" preload="auto" />

        {/* 頁首 */}
        <div className="flex items-start justify-between pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 text-2xl">📦</div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                訂單管理
              </h1>
              <p className="text-muted-foreground text-sm mt-1">即時查看與處理訂單</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-2 text-foreground/80">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              自動刷新
            </label>
            <Button variant="soft" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              {lang === 'zh' ? 'EN' : '中'}
            </Button>
          </div>
        </div>

        {/* 日期段 —— 深色卡 */}
        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-6">
          <div className="p-4 flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <button className={`px-4 py-2 rounded-full ${pill(range === 'today','yellow')}`} onClick={() => setRange('today')}>今日</button>
              <button className={`px-4 py-2 rounded-full ${pill(range === 'week','yellow')}`} onClick={() => setRange('week')}>本週</button>
              <button className={`px-4 py-2 rounded-full ${pill(range === 'custom','yellow')}`} onClick={() => setRange('custom')}>自訂</button>
            </div>

            {range === 'custom' && (
              <>
                <input aria-label="起始日" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-white/20 p-2 rounded bg-[#1F1F1F] text-white placeholder:text-white/40" />
                <input aria-label="結束日" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-white/20 p-2 rounded bg-[#1F1F1F] text-white placeholder:text-white/40" />
              </>
            )}

            <Button className="ml-auto" variant="soft" size="sm" onClick={manualRefresh} startIcon={<RefreshIcon />} aria-label="重新整理">
              重新整理
            </Button>
          </div>
        </div>

        {/* 狀態 Tab —— 深色卡 */}
        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-4">
          <div className="p-3 flex items-center gap-2">
            <button className={`px-4 py-2 rounded-full ${pill(filter === 'all','white')}`} onClick={() => setFilter('all')}>全部</button>
            <button className={`px-4 py-2 rounded-full ${pill(filter === 'pending','yellow')}`} onClick={() => setFilter('pending')}>未處理</button>
            <button className={`px-4 py-2 rounded-full ${pill(filter === 'completed','green')}`} onClick={() => setFilter('completed')}>已完成</button>
          </div>
        </div>

        {/* 快速篩選 —— 深色卡 */}
        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-6">
          <div className="px-4 py-3 border-b border-white/10"><h3 className="text-sm font-semibold">快速篩選</h3></div>
          <div className="p-3 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {tableOptions.map(opt => (
                <button key={`${opt.key}`} onClick={() => setTableFilter(opt.key)} className={`px-3 py-1.5 rounded-full ${pill(tableFilter === opt.key,'yellow')}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 錯誤 / 讀取 */}
        {loading && <p className="text-white/80 mb-2">讀取中…</p>}
        {errorMsg && <p className="text-red-300 mb-2">❌ 讀取失敗（{errorMsg}）</p>}

        {/* 訂單清單 —— 深色卡 */}
        {filteredOrders.length === 0 ? (
          <div className="bg-[#2B2B2B] text-white rounded-lg border border-white/10 shadow p-4">
            <p className="text-white/70">{filter === 'pending' ? '🔔 無未處理訂單' : '目前沒有訂單'}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredOrders.map(order => (
              <div key={order.id} className="bg-[#2B2B2B] text-white rounded-lg border border-white/10 shadow p-4">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="font-semibold">桌號：{String(displayTable(order.table_number))}</h2>
                  <div className="flex items-center gap-2">
                    {order.status === 'completed' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">✅ 已完成</span>
                    )}
                    <Button size="sm" variant="soft" startIcon={<EditIcon />} onClick={() => openEdit(order)}>修改</Button>
                    <Button size="sm" variant="destructive" startIcon={<TrashIcon />} onClick={() => setDeletingId(order.id)}>刪除</Button>
                  </div>
                </div>

                <div className="text-sm mb-1">
                  <strong>品項：</strong>
                  {(order.items ?? []).map((item, idx) => (
                    <div key={idx} className="mb-1">
                      {item.name} ×{item.quantity}
                      {renderOptions(item.options)}
                    </div>
                  ))}
                </div>

                <div className="text-sm"><strong>總金額：</strong> NT$ {calcTotal(order).toLocaleString('zh-TW')}</div>
                {order.spicy_level && <div className="text-sm text-red-300"><strong>辣度：</strong> {order.spicy_level}</div>}
                {order.note && <div className="text-sm text-white/70"><strong>備註：</strong> {order.note}</div>}

                {order.status !== 'completed' && (
                  <Button className="mt-3" variant="success" startIcon={<CheckIcon />} onClick={() => handleComplete(order.id)}>
                    完成訂單
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 編輯面板 —— 深色卡 + 白字 + 下拉式（桌號/狀態/辣度） */}
        {editingOrder && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <div className="orders-modal w-[min(100%-2rem,56rem)] max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg shadow-lg border border-white/10 bg-[#2B2B2B] text-white">
              {/* 標題列 */}
              <div className="px-6 pt-5 pb-3 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">修改訂單</h3>
                  <button className="text-sm text-white/80 hover:text-white" onClick={() => setEditingOrder(null)}>返回</button>
                </div>
              </div>

              {/* 內容 */}
              <div className="px-6 py-5 space-y-6">
                {/* 訂單層級欄位：下拉式 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/90 mb-1">桌號</label>
                    <select
                      value={editingOrder ? (isTakeoutStr(editingOrder.table_number) ? TAKEOUT_VALUE : String(editingOrder.table_number ?? '')) : ''}
                      onChange={e => setEditingOrder(prev => prev ? { ...prev, table_number: e.target.value } : prev)}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                    >
                      {tableSelectOptions.map(v => (
                        <option key={v} value={v}>{v === TAKEOUT_VALUE ? '外帶' : v}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-white/90 mb-1">狀態</label>
                    <select
                      value={editingOrder.status ?? 'pending'}
                      onChange={e => setEditingOrder(prev => prev ? { ...prev, status: e.target.value as any } : prev)}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                    >
                      <option value="pending">未處理</option>
                      <option value="completed">已完成</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-white/90 mb-1">辣度</label>
                    <select
                      value={editingOrder.spicy_level ?? ''}
                      onChange={e => setEditingOrder(prev => prev ? { ...prev, spicy_level: e.target.value || null } : prev)}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                    >
                      <option value="">（不設定）</option>
                      <option value="不辣">不辣</option>
                      <option value="小辣">小辣</option>
                      <option value="中辣">中辣</option>
                      <option value="大辣">大辣</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm text-white/90 mb-1">備註</label>
                    <textarea
                      autoComplete="off"
                      value={editingOrder.note ?? ''}
                      onChange={e => setEditingOrder(prev => prev ? { ...prev, note: e.target.value } : prev)}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                      rows={3}
                      placeholder="備註內容…"
                    />
                  </div>
                </div>

                {/* 品項清單 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">品項</h4>
                    <Button size="sm" variant="soft" onClick={addItem}>新增品項</Button>
                  </div>

                  {editItems.map((it, idx) => (
                    <div key={idx} className="rounded-lg border border-white/10 p-3 bg-[#2B2B2B]">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-7 md:col-span-7">
                          <label className="block text-xs text-white/80 mb-1">品名</label>
                          <input
                            value={it.name}
                            onChange={(e) => updateItem(idx, 'name', e.target.value)}
                            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                            placeholder="品名"
                          />
                        </div>
                        <div className="col-span-3 md:col-span-3">
                          <label className="block text-xs text-white/80 mb-1">數量</label>
                          <input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                            min={0}
                          />
                        </div>
                        <div className="col-span-2 md:col-span-2 flex items-end">
                          <Button size="sm" variant="destructive" onClick={() => removeItem(idx)}>刪</Button>
                        </div>
                      </div>

                      {/* 固定選項（甜度/冰塊/容量/加料） */}
                      <div className="mt-3">
                        <FixedOptionsEditor
                          rows={editOptionRows[idx] || []}
                          onChange={(rows) => setRowsForIndex(idx, rows)}
                        />
                      </div>

                      {/* 其他自定義選項（保留彈性） */}
                      <div className="mt-3">
                        <OptionEditor
                          title="其他選項"
                          rows={(editOptionRows[idx] || []).filter(r => !['甜度','冰塊','容量','加料'].includes(r.key))}
                          onChange={(rows) => {
                            const fixed = (editOptionRows[idx] || []).filter(r => ['甜度','冰塊','容量','加料'].includes(r.key as FixedKey))
                            setRowsForIndex(idx, [...fixed, ...rows])
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 底部按鈕列（黏底） */}
                <div className="flex justify-end gap-3 sticky bottom-0 pt-3 bg-[#2B2B2B]">
                  <Button variant="secondary" onClick={() => setEditingOrder(null)} disabled={isSaving}>
                    取消
                  </Button>
                  <Button variant="default" onClick={saveEdit} disabled={isSaving}>
                    {isSaving ? '儲存中…' : '儲存變更'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 刪除確認框 —— 深色一致 */}
        {deletingId && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <div className="w-[min(100%-2rem,32rem)] max-w-md max-h-[85vh] overflow-y-auto rounded-lg shadow-lg border border-white/10 bg-[#2B2B2B] text-white p-6">
              <h3 className="text-lg font-semibold mb-2">確認刪除</h3>
              <p className="text-sm text-white/80">此操作將刪除此筆訂單，且無法復原。確定要刪除嗎？</p>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setDeletingId(null)}>取消</Button>
                <Button variant="destructive" onClick={confirmDelete}>確認</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
