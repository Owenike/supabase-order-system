// /pages/store/orders.tsx
'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'

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

  // 編輯/刪除
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editItems, setEditItems] = useState<OrderItem[]>([])
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
          options: '選項'
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
          options: 'Options'
        }
      }[lang]),
    [lang]
  )

  // 舊資料鍵值中文化（與前台一致）
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
      <ul className="ml-4 list-disc text-gray-600">
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

  // 允許播放提示音（使用者互動後才可播）
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
      // 有新訂單音效
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
    setEditItems(
      (order.items ?? []).map((i: any) => ({
        name: String(i?.name ?? ''),
        quantity: Number.isFinite(Number(i?.quantity)) ? Math.max(0, Math.floor(Number(i.quantity))) : 0,
        price: Number.isFinite(Number(i?.price)) ? Math.max(0, Number(i.price)) : 0,
        options: i?.options ?? null
      }))
    )
  }

  const updateItem = (idx: number, key: 'name' | 'quantity' | 'price', value: string | number) => {
    setEditItems(prev => {
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

  const addItem = () => setEditItems(prev => [...prev, { name: '', quantity: 1, price: 0 } as OrderItem])
  const removeItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx))

  const saveEdit = async () => {
    if (!editingOrder) return
    if (!editingOrder.table_number || !String(editingOrder.table_number).trim()) {
      alert(lang === 'zh' ? '請輸入桌號（或外帶）' : 'Please input table number or takeout.')
      return
    }

    // 保留每個品項原本的 options（不提供修改 UI）
    const cleanedItems = editItems
      .map((i, idx) => ({
        name: String(i.name || '').trim(),
        quantity: Number.isFinite(Number(i.quantity)) ? Math.max(0, Math.floor(Number(i.quantity))) : 0,
        price: Number.isFinite(Number(i.price)) ? Math.max(0, Number(i.price)) : 0,
        ...(editingOrder.items?.[idx]?.options ? { options: editingOrder.items[idx].options as OptionsMap } : {})
      }))
      .filter(i => i.name && i.quantity > 0)

    const payload: Record<string, any> = {
      table_number: String(editingOrder.table_number).trim(),
      status: ['pending', 'completed'].includes(String(editingOrder.status || '')) ? editingOrder.status : 'pending',
      note: editingOrder.note?.toString().trim() ? editingOrder.note!.toString().trim() : null,
      items: cleanedItems
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

  // 篩選
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (filter === 'pending') return order.status !== 'completed'
      if (filter === 'completed') return order.status === 'completed'
      return true
    })
  }, [orders, filter])

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
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      <audio ref={audioRef} src="/ding.mp3" preload="auto" />

      {/* 頁首 */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">📦</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{dict.title}</h1>
            <p className="text-white/70 text-sm mt-1">即時查看與處理訂單</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm flex items-center gap-2 text-white/80">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            {dict.autoRefresh}
          </label>
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="inline-flex h-9 px-3 items-center rounded-md bg-white/10 text-white hover:bg-white/15 border border-white/15"
          >
            {lang === 'zh' ? 'EN' : '中'}
          </button>
        </div>
      </div>

      {/* 區間與重整 */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 mb-6">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md overflow-hidden shadow">
            <button
              onClick={() => setRange('today')}
              className={`px-4 py-2 ${range === 'today' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
            >
              {dict.today}
            </button>
            <button
              onClick={() => setRange('week')}
              className={`px-4 py-2 ${range === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
            >
              {dict.week}
            </button>
            <button
              onClick={() => setRange('custom')}
              className={`px-4 py-2 ${range === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
            >
              {dict.custom}
            </button>
          </div>

          {range === 'custom' && (
            <>
              <input
                aria-label={dict.from}
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border p-2 rounded"
              />
              <input
                aria-label={dict.to}
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border p-2 rounded"
              />
            </>
          )}

          <button
            onClick={manualRefresh}
            className="ml-auto px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
            aria-label={dict.refresh}
          >
            {dict.refresh}
          </button>
        </div>
      </div>

      {/* 狀態篩選 */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 mb-6">
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
          >
            {dict.all}
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded ${filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-900'}`}
          >
            {dict.pending}
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded ${filter === 'completed' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-900'}`}
          >
            {dict.completed}
          </button>
        </div>
      </div>

      {/* 錯誤 / 讀取 */}
      {loading && <p className="text-white/80 mb-2">{dict.loading}</p>}
      {errorMsg && <p className="text-red-400 mb-2">❌ {dict.error}（{errorMsg}）</p>}

      {/* 訂單清單 */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white text-gray-900 rounded-lg border shadow p-4">
          <p className="text-gray-600">
            {filter === 'pending' ? dict.noPending : dict.noOrders}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map(order => (
            <div key={order.id} className="bg-white text-gray-900 rounded-lg border shadow p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-semibold">
                  {dict.table}：{displayTable(order.table_number)}
                </h2>
                <div className="flex items-center gap-2">
                  {order.status === 'completed' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-600/15 text-emerald-700 border border-emerald-600/20">
                      {dict.done}
                    </span>
                  )}
                  <button
                    onClick={() => openEdit(order)}
                    className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
                    aria-label={dict.edit}
                  >
                    {dict.edit}
                  </button>
                  <button
                    onClick={() => deleteOrder(order.id)}
                    className="text-sm px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                    aria-label={dict.delete}
                  >
                    {dict.delete}
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-700 mb-1">
                <strong>{dict.items}：</strong>
                {(order.items ?? []).map((item, idx) => (
                  <div key={idx} className="mb-1">
                    {item.name} ×{item.quantity}
                    {renderOptions(item.options)}
                  </div>
                ))}
              </div>

              <div className="text-sm text-gray-700">
                <strong>{dict.total}：</strong> NT$ {calcTotal(order)}
              </div>

              {order.spicy_level && (
                <div className="text-sm text-red-600">
                  <strong>{dict.spicy}：</strong> {order.spicy_level}
                </div>
              )}

              {order.note && (
                <div className="text-sm text-gray-500">
                  <strong>{dict.note}：</strong> {order.note}
                </div>
              )}

              {order.status !== 'completed' && (
                <button
                  onClick={() => handleComplete(order.id)}
                  className="mt-3 bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 active:scale-95 transition"
                >
                  {dict.complete}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 編輯面板 */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{dict.editOrder}</h3>
              <button className="text-sm text-gray-500" onClick={() => setEditingOrder(null)}>
                {dict.back}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{dict.table}</label>
                <input
                  type="text"
                  value={editingOrder.table_number ?? ''}
                  onChange={e => setEditingOrder(prev => prev ? { ...prev, table_number: e.target.value } : prev)}
                  className="w-full border rounded px-3 py-2"
                  placeholder={dict.takeout}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">{dict.status}</label>
                <select
                  value={editingOrder.status ?? 'pending'}
                  onChange={e => setEditingOrder(prev => prev ? { ...prev, status: e.target.value as any } : prev)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="pending">{dict.status_pending}</option>
                  <option value="completed">{dict.status_completed}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">{dict.spicy}</label>
                <input
                  type="text"
                  value={editingOrder.spicy_level ?? ''}
                  onChange={e => setEditingOrder(prev => prev ? { ...prev, spicy_level: e.target.value } : prev)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="小辣/中辣/不辣…"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">{dict.note}</label>
                <textarea
                  value={editingOrder.note ?? ''}
                  onChange={e => setEditingOrder(prev => prev ? { ...prev, note: e.target.value } : prev)}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  placeholder="備註內容…"
                />
              </div>
            </div>

            {/* 品項編輯（不動 options，但會保留） */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">{dict.items}</h4>
                <button
                  onClick={addItem}
                  className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
                >
                  + {dict.addItem}
                </button>
              </div>

              <div className="grid gap-2">
                {editItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={it.name}
                      onChange={e => updateItem(idx, 'name', e.target.value)}
                      className="col-span-6 border rounded px-3 py-2"
                      placeholder={dict.itemName}
                    />
                    <input
                      type="number"
                      min={0}
                      value={it.quantity}
                      onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                      className="col-span-2 border rounded px-3 py-2"
                      placeholder={dict.itemQty}
                    />
                    <input
                      type="number"
                      min={0}
                      value={it.price}
                      onChange={e => updateItem(idx, 'price', Number(e.target.value))}
                      className="col-span-2 border rounded px-3 py-2"
                      placeholder={dict.itemPrice}
                    />
                    <button
                      onClick={() => removeItem(idx)}
                      className="col-span-2 text-sm px-3 py-2 rounded border border-red-300 text-red-600 hover:bg-red-50"
                    >
                      {dict.delete}
                    </button>
                  </div>
                ))}
                {editItems.length === 0 && (
                  <p className="text-sm text-gray-500">（尚無品項，請點「{dict.addItem}」）</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 rounded border border-gray-300"
                disabled={isSaving}
              >
                {dict.cancel}
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={isSaving}
              >
                {isSaving ? dict.saving : dict.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認框 */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-2">{dict.confirmDeleteTitle}</h3>
            <p className="text-sm text-gray-700">{dict.confirmDeleteText}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={cancelDelete} className="px-4 py-2 rounded border border-gray-300">
                {dict.cancel}
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                {dict.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
