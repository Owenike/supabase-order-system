'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface OrderItem {
  name: string
  quantity: number
  price: number
}

interface Order {
  id: string
  store_id: string
  table_number: string
  items: OrderItem[]
  note?: string
  spicy_level?: string
  status?: string
  created_at: string
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

  // 編輯用 state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editItems, setEditItems] = useState<OrderItem[]>([])
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const dict = {
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
      actions: '操作'
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
      actions: 'Actions'
    }
  }[lang]

  // 🔓 解鎖音效播放限制（使用者互動一次後才允許播放）
  useEffect(() => {
    const enableAudio = () => {
      audioRef.current?.play().catch(() => {})
      document.removeEventListener('click', enableAudio)
    }
    document.addEventListener('click', enableAudio, { once: true })
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('store_id')
    if (stored) setStoreId(stored)
  }, [])

  // 依篩選區間輪詢
  useEffect(() => {
    if (!storeId) return

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
    } else if (range === 'custom') {
      if (!startDate || !endDate) return
      start = new Date(startDate + 'T00:00:00')
      end = new Date(endDate + 'T23:59:59')
    }

    fetchOrders(storeId, start.toISOString(), end.toISOString())

    const interval = setInterval(() => {
      fetchOrders(storeId, start.toISOString(), end.toISOString())
    }, 3000)

    return () => clearInterval(interval)
  }, [storeId, range, startDate, endDate])

  const fetchOrders = async (storeId: string, from: string, to: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ 查詢失敗：', error.message)
      return
    }

    if (lastOrderCount.current !== null && data.length > (lastOrderCount.current ?? 0)) {
      audioRef.current?.play()
    }
    lastOrderCount.current = data.length
    setOrders(data as Order[])
  }

  const refreshByCurrentRange = async () => {
    if (!storeId) return
    const now = new Date()
    let from = new Date()
    let to = new Date()

    if (range === 'today') {
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
    } else if (range === 'week') {
      const day = now.getDay() || 7
      from.setDate(now.getDate() - day + 1)
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
    } else {
      if (!startDate || !endDate) return
      from = new Date(startDate + 'T00:00:00')
      to = new Date(endDate + 'T23:59:59')
    }
    await fetchOrders(storeId, from.toISOString(), to.toISOString())
  }

  const handleComplete = async (id: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed' })
      .eq('id', id)

    if (error) {
      alert('訂單更新失敗，請稍後再試')
      return
    }
    refreshByCurrentRange()
  }

  // 進入編輯
  const openEdit = (order: Order) => {
    setEditingOrder({ ...order })
    // 帶入 price，缺少則預設 0
    setEditItems(
      (order.items ?? []).map((i: any) => ({
        name: String(i?.name ?? ''),
        quantity: Number.isFinite(Number(i?.quantity)) ? Math.floor(Number(i.quantity)) : 0,
        price: Number.isFinite(Number(i?.price)) ? Number(i.price) : 0
      }))
    )
  }

  // 變更單一品項
  const updateItem = (idx: number, key: 'name' | 'quantity' | 'price', value: string | number) => {
    setEditItems(prev => {
      const next = [...prev]
      const target = { ...next[idx] }
      if (key === 'name') target.name = String(value)
      if (key === 'quantity') {
        const n = Number(value)
        target.quantity = Number.isNaN(n) || n < 0 ? 0 : Math.floor(n)
      }
      if (key === 'price') {
        const p = Number(value)
        target.price = Number.isNaN(p) || p < 0 ? 0 : p
      }
      next[idx] = target
      return next
    })
  }

  // 新增/刪除品項
  const addItem = () => setEditItems(prev => [...prev, { name: '', quantity: 1, price: 0 }])
  const removeItem = (idx: number) =>
    setEditItems(prev => prev.filter((_, i) => i !== idx))

  // 儲存編輯內容
  const saveEdit = async () => {
    if (!editingOrder) return
    if (!editingOrder.table_number) {
      alert('請輸入桌號（或外帶）')
      return
    }

    // 整理品項：去除空白品名/數量<=0；價格預設 0
    const cleanedItems = editItems
      .map(i => ({
        name: String(i.name || '').trim(),
        quantity: Number.isFinite(Number(i.quantity)) ? Math.max(0, Math.floor(Number(i.quantity))) : 0,
        price: Number.isFinite(Number(i.price)) ? Math.max(0, Number(i.price)) : 0
      }))
      .filter(i => i.name && i.quantity > 0)

    // 動態 payload
    const payload: Record<string, any> = {
      table_number: editingOrder.table_number,
      status: ['pending', 'completed'].includes(editingOrder.status || '') ? editingOrder.status : 'pending',
      note: editingOrder.note?.trim() ? editingOrder.note.trim() : null,
      items: cleanedItems
    }
    if (editingOrder.spicy_level && editingOrder.spicy_level.trim()) {
      payload.spicy_level = editingOrder.spicy_level.trim()
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
    refreshByCurrentRange()
  }

  // 刪除訂單
  const deleteOrder = async (id: string) => {
    setDeletingId(id)
  }

  const confirmDelete = async () => {
    if (!deletingId) return
    const { error } = await supabase.from('orders').delete().eq('id', deletingId)
    if (error) {
      alert('刪除失敗，請稍後再試')
      return
    }
    setDeletingId(null)
    refreshByCurrentRange()
  }

  const cancelDelete = () => setDeletingId(null)

  const filteredOrders = orders.filter(order => {
    if (filter === 'pending') return order.status !== 'completed'
    if (filter === 'completed') return order.status === 'completed'
    return true
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <audio ref={audioRef} src="/ding.mp3" preload="auto" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📦 {dict.title}</h1>
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="text-sm border px-2 py-1 rounded"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>

      {/* 區間選擇 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => setRange('today')} className={`px-4 py-1 rounded ${range === 'today' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{dict.today}</button>
        <button onClick={() => setRange('week')} className={`px-4 py-1 rounded ${range === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{dict.week}</button>
        <button onClick={() => setRange('custom')} className={`px-4 py-1 rounded ${range === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{dict.custom}</button>

        {range === 'custom' && (
          <>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border p-1 rounded"
              placeholder={dict.from}
            />
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border p-1 rounded"
              placeholder={dict.to}
            />
          </>
        )}
      </div>

      {/* 狀態篩選 */}
      <div className="flex gap-3 mb-6">
        <button onClick={() => setFilter('all')} className={`px-4 py-1 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{dict.all}</button>
        <button onClick={() => setFilter('pending')} className={`px-4 py-1 rounded ${filter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>{dict.pending}</button>
        <button onClick={() => setFilter('completed')} className={`px-4 py-1 rounded ${filter === 'completed' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>{dict.completed}</button>
      </div>

      {/* 訂單清單 */}
      {filteredOrders.length === 0 ? (
        <p className="text-gray-500">
          {filter === 'pending' ? dict.noPending : dict.noOrders}
        </p>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map(order => (
            <div key={order.id} className="border rounded-lg p-4 shadow hover:shadow-md transition">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-semibold">
                  {dict.table}：{order.table_number === '外帶' ? dict.takeout : order.table_number}
                </h2>
                <div className="flex items-center gap-2">
                  {order.status === 'completed' && <span className="text-green-600 text-sm">{dict.done}</span>}
                  <button
                    onClick={() => openEdit(order)}
                    className="text-sm px-3 py-1 rounded border hover:bg-gray-100"
                    aria-label={dict.edit}
                  >
                    {dict.edit}
                  </button>
                  <button
                    onClick={() => deleteOrder(order.id)}
                    className="text-sm px-3 py-1 rounded border hover:bg-red-50 text-red-600"
                    aria-label={dict.delete}
                  >
                    {dict.delete}
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-700 mb-1">
                <strong>{dict.items}：</strong>
                {order.items?.map((item, idx) => (
                  <span key={idx}>
                    {item.name} ×{item.quantity}
                    {idx < (order.items?.length ?? 0) - 1 ? '、' : ''}
                  </span>
                ))}
              </div>

              {order.spicy_level && (
                <div className="text-sm text-red-500">
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
                  className="mt-3 bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 active:scale-95 transition"
                >
                  {dict.complete}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 編輯面板（簡易 Modal） */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{dict.editOrder}</h3>
              <button className="text-sm text-gray-500" onClick={() => setEditingOrder(null)}>{dict.back}</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{dict.table}</label>
                <input
                  type="text"
                  value={editingOrder.table_number}
                  onChange={e => setEditingOrder(prev => prev ? { ...prev, table_number: e.target.value } : prev)}
                  className="w-full border rounded px-3 py-2"
                  placeholder={dict.takeout}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">{dict.status}</label>
                <select
                  value={editingOrder.status ?? 'pending'}
                  onChange={e => setEditingOrder(prev => prev ? { ...prev, status: e.target.value } : prev)}
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

            {/* 品項編輯 */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">{dict.items}</h4>
                <button
                  onClick={addItem}
                  className="text-sm px-3 py-1 rounded border hover:bg-gray-100"
                >
                  + {dict.addItem}
                </button>
              </div>

              <div className="grid gap-2">
                {editItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    {/* 品名 */}
                    <input
                      type="text"
                      value={it.name}
                      onChange={e => updateItem(idx, 'name', e.target.value)}
                      className="col-span-6 border rounded px-3 py-2"
                      placeholder={dict.itemName}
                    />
                    {/* 數量 */}
                    <input
                      type="number"
                      min={0}
                      value={it.quantity}
                      onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                      className="col-span-2 border rounded px-3 py-2"
                      placeholder={dict.itemQty}
                    />
                    {/* 單價 */}
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
                      className="col-span-2 text-sm px-3 py-2 rounded border hover:bg-red-50 text-red-600"
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
                className="px-4 py-2 rounded border"
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
              <button onClick={cancelDelete} className="px-4 py-2 rounded border">{dict.cancel}</button>
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
