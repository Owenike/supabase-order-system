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
        green: 'bg-emerald-600 text-white border-emerald-600',
        white: 'bg-white text-gray-900 border-white',
        gray: 'bg-gray-200 text-gray-900 border-gray-200',
      }[tone])
    : 'bg-white/10 text-white border border-white/15 hover:bg-white/15 transition'

// ---- 工具 ----
const isTakeoutStr = (t: string | null) => {
  const s = String(t ?? '').trim().toLowerCase()
  return s === 'takeout' || s === '外帶' || s === '0'
}

// ---- 選項編輯器（深色版） ----
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
              placeholder={r.isArray ? '多值用逗號分隔，例如：珍珠,椰果' : '值，例如：半糖 / 去冰 / 大杯'}
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
            <Button
              size="sm"
              variant="destructive"
              className="col-span-1"
              onClick={() => removeRow(idx)}
            >
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

  // 鎖背景捲動
  useEffect(() => {
    const lock = editingOrder || deletingId
    const prev = document.body.style.overflow
    if (lock) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = prev || ''
    return () => {
      document.body.style.overflow = prev || ''
    }
  }, [editingOrder, deletingId])

  // 快速篩選：桌號/外帶
  const [tableFilter, setTableFilter] = useState<TableFilter>('ALL')

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
          itemPrice: '單價',
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
          itemPrice: 'Price',
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

    const mapSweet: Record<string, string> = { '0': '無糖', '30': '微糖', '50': '半糖', '70': '少糖', '100': '全糖' }
    const mapIce: Record<string, string> = { '0': '去冰', '30': '微冰', '50': '少冰', '100': '正常冰' }
    const mapSize: Record<string, string> = { S: '小杯', M: '中杯', L: '大杯' }

    let vText = V.join('、')
    if (key === 'fixed_sweetness') vText = V.map((x) => mapSweet[x] || x).join('、')
    if (key === 'fixed_ice') vText = V.map((x) => mapIce[x] || x).join('、')
    if (key === 'fixed_size') vText = V.map((x) => mapSize[x] || x).join('、')
    return { k, v: vText }
  }

  const renderOptions = (opts?: OptionsMap | null) => {
    if (!opts || typeof opts !== 'object') return null
    const entries = Object.entries(opts)
    if (!entries.length) return null
    return (
      <ul className="ml-4 list-disc text-muted-foreground">
        {entries.map(([rawK, rawV]) => {
          const { k, v } = translateOptionPair(rawK, rawV)
          return (
            <li key={rawK} className="text-sm">
              {k}：{v}
            </li>
          )
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
      return () => {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = null
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [storeId, range, startDate, endDate, autoRefresh])

  // 查詢
  const fetchOrders = async (sid: string, fromIso: string, toIso: string) => {
    setLoading(true)
    setErrorMsg('')
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('store_id', sid)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })

    setLoading(false)
    if (error) {
      console.error('❌ 查詢失敗：', error.message)
      setErrorMsg(error.message)
      return
    }

    const list = (data || []) as Order[]
    if (lastOrderCount.current !== null && list.length > (lastOrderCount.current ?? 0)) {
      audioRef.current?.play().catch(() => {})
    }
    lastOrderCount.current = list.length
    setOrders(list)
  }

  const manualRefresh = async () => {
    if (!storeId) return
    const win = calcRange()
    if (!win) return
    await fetchOrders(storeId, win.fromIso, win.toIso)
  }

  // 完成訂單
  const handleComplete = async (id: string) => {
    const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', id)
    if (error) {
      alert('訂單更新失敗，請稍後再試')
      return
    }
    manualRefresh()
  }

  // 編輯
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
    localItems.forEach((it, idx) => {
      rows[idx] = mapOptionsToRows(it.options ?? null)
    })
    setEditOptionRows(rows)
  }

  const updateItem = (idx: number, key: 'name' | 'quantity' | 'price', value: string | number) => {
    setEditItems((prev) => {
      const next = [...prev]
      const t = { ...next[idx] }
      if (key === 'name') t.name = String(value)
      if (key === 'quantity') {
        const n = Number(value)
        t.quantity = Number.isNaN(n) || n < 0 ? 0 : Math.floor(n)
      }
      if (key === 'price') {
        const p = Number(value)
        t.price = Number.isNaN(p) || p < 0 ? 0 : p
      }
      next[idx] = t
      return next
    })
  }

  const addItem = () =>
    setEditItems((prev) => [...prev, { name: '', quantity: 1, price: 0, options: null } as OrderItem])

  const removeItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx))
    setEditOptionRows((prev) => {
      const next = { ...prev }
      delete next[idx]
      const rebuilt: Record<number, OptionRow[]> = {}
      const keys = Object.keys(prev).map(Number).sort((a, b) => a - b)
      let j = 0
      keys.forEach((k) => {
        if (k === idx) return
        rebuilt[j++] = prev[k]
      })
      return rebuilt
    })
  }

  const setRowsForIndex = (idx: number, rows: OptionRow[]) =>
    setEditOptionRows((prev) => ({ ...prev, [idx]: rows }))

  const saveEdit = async () => {
    if (!editingOrder) return
    if (!editingOrder.table_number || !String(editingOrder.table_number).trim()) {
      alert(lang === 'zh' ? '請輸入桌號（或外帶）' : 'Please input table number or takeout.')
      return
    }

    const cleanedItems = editItems
      .map((i, idx) => {
        const options = rowsToOptions(editOptionRows[idx] || [])
        return {
          name: String(i.name || '').trim(),
          quantity: Number.isFinite(Number(i.quantity)) ? Math.max(0, Math.floor(Number(i.quantity))) : 0,
          price: Number.isFinite(Number(i.price)) ? Math.max(0, Number(i.price)) : 0,
          ...(options ? { options } : {}),
        }
      })
      .filter((i) => i.name && i.quantity > 0)

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

    if (error) {
      console.error('更新失敗', error)
      alert(`儲存失敗：${error.message}`)
      return
    }

    setEditingOrder(null)
    setEditItems([])
    setEditOptionRows({})
    manualRefresh()
  }

  // 刪除
  const deleteOrder = (id: string) => setDeletingId(id)
  const confirmDelete = async () => {
    if (!deletingId) return
    const { error } = await supabase.from('orders').delete().eq('id', deletingId)
    if (error) {
      alert('刪除失敗，請稍後再試')
      return
    }
    setDeletingId(null)
    manualRefresh()
  }
  const cancelDelete = () => setDeletingId(null)

  // 桌號清單（目前查詢結果內）
  const tableOptions = useMemo(() => {
    const map = new Map<string, { key: TableFilter; label: string }>()
    map.set('ALL', { key: 'ALL', label: lang === 'zh' ? '全部桌號' : 'All Tables' })
    map.set('TAKEOUT', { key: 'TAKEOUT', label: dict.takeout as string })
    orders.forEach((o) => {
      if (isTakeoutStr(o.table_number)) return
      const raw = String(o.table_number ?? '').trim()
      if (!raw) return
      if (!map.has(raw)) map.set(raw, { key: raw, label: raw })
    })
    return Array.from(map.values())
  }, [orders, dict.takeout, lang])

  // 最終篩選
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
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
    if (s === 'takeout' || s === '外帶' || s === '0') return dict.takeout
    return t
  }

  return (
    <main className="bg-background min-h-screen">
      <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
        <audio ref={audioRef} src="/ding.mp3" preload="auto" />

        {/* 頁首 */}
        <div className="flex items-start justify-between pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 text-2xl">📦</div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {dict.title}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">即時查看與處理訂單</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-2 text-foreground/80">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              {dict.autoRefresh}
            </label>
            <Button variant="soft" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              {lang === 'zh' ? 'EN' : '中'}
            </Button>
          </div>
        </div>

        {/* 日期段 */}
        <div className="bg-card text-card-foreground rounded-lg shadow border border-border mb-6">
          <div className="p-4 flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <button className={`px-4 py-2 rounded-full ${pill(range === 'today', 'yellow')}`} onClick={() => setRange('today')}>
                {dict.today}
              </button>
              <button className={`px-4 py-2 rounded-full ${pill(range === 'week', 'yellow')}`} onClick={() => setRange('week')}>
                {dict.week}
              </button>
              <button className={`px-4 py-2 rounded-full ${pill(range === 'custom', 'yellow')}`} onClick={() => setRange('custom')}>
                {dict.custom}
              </button>
            </div>

            {range === 'custom' && (
              <>
                <input aria-label={dict.from} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-input p-2 rounded bg-input text-foreground placeholder:text-muted-foreground" />
                <input aria-label={dict.to} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-input p-2 rounded bg-input text-foreground placeholder:text-muted-foreground" />
              </>
            )}

            <Button className="ml-auto" variant="soft" size="sm" onClick={manualRefresh} startIcon={<RefreshIcon />} aria-label={dict.refresh}>
              {dict.refresh}
            </Button>
          </div>
        </div>

        {/* 狀態 Tab */}
        <div className="bg-card text-card-foreground rounded-lg shadow border border-border mb-4">
          <div className="p-3 flex items-center gap-2">
            <button className={`px-4 py-2 rounded-full ${pill(filter === 'all', 'white')}`} onClick={() => setFilter('all')}>
              {dict.all}
            </button>
            <button className={`px-4 py-2 rounded-full ${pill(filter === 'pending', 'yellow')}`} onClick={() => setFilter('pending')}>
              {dict.pending}
            </button>
            <button className={`px-4 py-2 rounded-full ${pill(filter === 'completed', 'green')}`} onClick={() => setFilter('completed')}>
              {dict.completed}
            </button>
          </div>
        </div>

        {/* 快速篩選 */}
        <div className="bg-card text-card-foreground rounded-lg shadow border border-border mb-6">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">{dict.quickFilter}</h3>
          </div>
          <div className="p-3 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {tableOptions.map((opt) => (
                <button
                  key={`${opt.key}`}
                  onClick={() => setTableFilter(opt.key)}
                  className={`px-3 py-1.5 rounded-full ${pill(tableFilter === opt.key, 'yellow')}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 錯誤 / 讀取 */}
        {loading && <p className="text-foreground/80 mb-2">{dict.loading}</p>}
        {errorMsg && <p className="text-red-400 mb-2">❌ {dict.error}（{errorMsg}）</p>}

        {/* 訂單清單 */}
        {filteredOrders.length === 0 ? (
          <div className="bg-card text-card-foreground rounded-lg border border-border shadow p-4">
            <p className="text-muted-foreground">
              {filter === 'pending' ? dict.noPending : dict.noOrders}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-card text-card-foreground rounded-lg border border-border shadow p-4">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="font-semibold">
                    {dict.table}：{String(displayTable(order.table_number))}
                  </h2>
                  <div className="flex items-center gap-2">
                    {order.status === 'completed' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                        {dict.done}
                      </span>
                    )}
                    <Button size="sm" variant="soft" startIcon={<EditIcon />} onClick={() => openEdit(order)} aria-label={dict.edit}>
                      {dict.edit}
                    </Button>
                    <Button size="sm" variant="destructive" startIcon={<TrashIcon />} onClick={() => setDeletingId(order.id)} aria-label={dict.delete}>
                      {dict.delete}
                    </Button>
                  </div>
                </div>

                <div className="text-sm mb-1">
                  <strong>{dict.items}：</strong>
                  {(order.items ?? []).map((item, idx) => (
                    <div key={idx} className="mb-1">
                      {item.name} ×{item.quantity}
                      {renderOptions(item.options)}
                    </div>
                  ))}
                </div>

                <div className="text-sm">
                  <strong>{dict.total}：</strong> NT$ {calcTotal(order).toLocaleString('zh-TW')}
                </div>

                {order.spicy_level && (
                  <div className="text-sm text-red-300">
                    <strong>{dict.spicy}：</strong> {order.spicy_level}
                  </div>
                )}

                {order.note && (
                  <div className="text-sm text-muted-foreground">
                    <strong>{dict.note}：</strong> {order.note}
                  </div>
                )}

                {order.status !== 'completed' && (
                  <Button className="mt-3" variant="success" startIcon={<CheckIcon />} onClick={() => handleComplete(order.id)}>
                    {dict.complete}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 編輯面板 —— 深色卡 + 白字 + 淡白邊 + 內部滾動 */}
        {editingOrder && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <div className="w-[min(100%-2rem,56rem)] max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg shadow-lg border border-white/10 bg-[#2B2B2B] text-white">
              {/* 標題列 */}
              <div className="px-6 pt-5 pb-3 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">修改訂單</h3>
                  <button className="text-sm text-white/80 hover:text-white" onClick={() => setEditingOrder(null)}>
                    返回
                  </button>
                </div>
              </div>

              <div className="px-6 py-5 space-y-6">
                {/* 訂單層級欄位 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/90 mb-1">桌號</label>
                    <input
                      type="text"
                      value={editingOrder.table_number ?? ''}
                      onChange={(e) => setEditingOrder((prev) => (prev ? { ...prev, table_number: e.target.value } : prev))}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                      placeholder="外帶"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-white/90 mb-1">狀態</label>
                    <select
                      value={editingOrder.status ?? 'pending'}
                      onChange={(e) => setEditingOrder((prev) => (prev ? { ...prev, status: e.target.value as any } : prev))}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                    >
                      <option value="pending">未處理</option>
                      <option value="completed">已完成</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-white/90 mb-1">辣度</label>
                    <input
                      type="text"
                      value={editingOrder.spicy_level ?? ''}
                      onChange={(e) => setEditingOrder((prev) => (prev ? { ...prev, spicy_level: e.target.value } : prev))}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                      placeholder="小辣/中辣/不辣…"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm text-white/90 mb-1">備註</label>
                    <textarea
                      value={editingOrder.note ?? ''}
                      onChange={(e) => setEditingOrder((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                      rows={3}
                      className="w-full rounded px-3 py-2 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                      placeholder="備註內容…"
                    />
                  </div>
                </div>

                {/* 品項清單 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">品項</h4>
                    <Button size="sm" variant="soft" onClick={addItem}>
                      新增品項
                    </Button>
                  </div>

                  {editItems.map((it, idx) => (
                    <div key={idx} className="rounded-lg border border-white/10 p-3 bg-[#2B2B2B]">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-5">
                          <label className="block text-xs text-white/80 mb-1">品名</label>
                          <input
                            value={it.name}
                            onChange={(e) => updateItem(idx, 'name', e.target.value)}
                            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                            placeholder="品名"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs text-white/80 mb-1">數量</label>
                          <input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                            min={0}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs text-white/80 mb-1">單價</label>
                          <input
                            type="number"
                            value={it.price}
                            onChange={(e) => updateItem(idx, 'price', e.target.value)}
                            className="w-full rounded px-2 py-1 bg-[#1F1F1F] text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
                            min={0}
                          />
                        </div>
                        <div className="col-span-1 flex items-end">
                          <Button size="sm" variant="destructive" onClick={() => removeItem(idx)}>
                            刪
                          </Button>
                        </div>
                      </div>

                      {/* 選項編輯器（深色） */}
                      <div className="mt-3">
                        <OptionEditor
                          title={dict.options as string}
                          rows={editOptionRows[idx] || []}
                          onChange={(rows) => setRowsForIndex(idx, rows)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 底部按鈕列（黏底） */}
                <div className="flex justify-end gap-3 sticky bottom-0 pt-3 bg-[#2B2B2B]">
                  <Button variant="secondary" onClick={() => setEditingOrder(null)} disabled={isSaving}>
                    {dict.cancel}
                  </Button>
                  <Button variant="default" onClick={saveEdit} disabled={isSaving}>
                    {isSaving ? dict.saving : dict.save}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 刪除確認框（深色風格一致） */}
        {deletingId && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <div className="w-[min(100%-2rem,32rem)] max-w-md max-h-[85vh] overflow-y-auto rounded-lg shadow-lg border border-white/10 bg-[#2B2B2B] text-white p-6">
              <h3 className="text-lg font-semibold mb-2">{dict.confirmDeleteTitle}</h3>
              <p className="text-sm text-white/80">{dict.confirmDeleteText}</p>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setDeletingId(null)}>
                  {dict.cancel}
                </Button>
                <Button variant="destructive" onClick={confirmDelete}>
                  {dict.confirm}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
