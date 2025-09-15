'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import dayjs from 'dayjs'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer
} from 'recharts'

interface MenuItemStat {
  name: string
  total: number
  amount: number
}
interface DailyStat {
  date: string
  orders: number
  revenue: number
}
interface OrderItem {
  name: string
  quantity: number
  price?: number
}
interface Order {
  id: string
  created_at: string
  table_number: string | null
  items: OrderItem[]
  note?: string
}

/** --------- 安全數值工具，避免 NaN ---------- */
const n = (v: any) => {
  const num = Number(v)
  return Number.isFinite(num) ? num : 0
}
const lineTotal = (item: OrderItem) => n(item.price) * n(item.quantity)
const fmt = (v: number) => `NT$ ${n(v).toLocaleString('zh-TW')}`

export default function StoreStatsPage() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [inStats, setInStats] = useState<MenuItemStat[]>([])
  const [outStats, setOutStats] = useState<MenuItemStat[]>([])
  const [inRevenue, setInRevenue] = useState(0)
  const [outRevenue, setOutRevenue] = useState(0)
  const [filterType, setFilterType] = useState<'today' | 'week' | 'custom'>('today')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dailyData, setDailyData] = useState<DailyStat[]>([])
  const [orderList, setOrderList] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string>('')

  // KPI
  const totalRevenue = useMemo(() => inRevenue + outRevenue, [inRevenue, outRevenue])
  const totalOrders = useMemo(() => dailyData.reduce((s, d) => s + n(d.orders), 0), [dailyData])

  const fetchStats = useCallback(async (sid: string) => {
    setLoading(true)
    setErr('')
    try {
      let fromISO = ''
      let toISO = dayjs().endOf('day').toISOString()

      if (filterType === 'today') {
        fromISO = dayjs().startOf('day').toISOString()
      } else if (filterType === 'week') {
        // 以週一為一週起始
        const now = dayjs()
        const day = now.day() === 0 ? 7 : now.day()
        fromISO = now.subtract(day - 1, 'day').startOf('day').toISOString()
      } else if (filterType === 'custom' && startDate && endDate) {
        fromISO = dayjs(startDate).startOf('day').toISOString()
        toISO = dayjs(endDate).endOf('day').toISOString()
      }

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', sid)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: true })

      if (error || !data) throw new Error(error?.message || '查詢失敗')

      const inMap: Record<string, { quantity: number; amount: number }> = {}
      const outMap: Record<string, { quantity: number; amount: number }> = {}
      let inRev = 0
      let outRev = 0
      const dailyMap: Record<string, { orders: number; revenue: number }> = {}

      ;(data as Order[]).forEach((order) => {
        const t = String(order.table_number ?? '').trim().toLowerCase()
        const isTakeout = t === '外帶' || t === 'takeout' || t === '0'
        const date = dayjs(order.created_at).format('YYYY-MM-DD')
        if (!dailyMap[date]) dailyMap[date] = { orders: 0, revenue: 0 }
        dailyMap[date].orders++

        order.items?.forEach((item) => {
          const target = isTakeout ? outMap : inMap
          if (!target[item.name]) target[item.name] = { quantity: 0, amount: 0 }

          const qty = n(item.quantity)
          const amount = lineTotal(item)

          target[item.name].quantity += qty
          target[item.name].amount += amount

          if (isTakeout) outRev += amount
          else inRev += amount
          dailyMap[date].revenue += amount
        })
      })

      const format = (map: typeof inMap) =>
        Object.entries(map)
          .map(([name, stat]) => ({
            name,
            total: n(stat.quantity),
            amount: n(stat.amount)
          }))
          .sort((a, b) => b.amount - a.amount)

      const dailyStatArr: DailyStat[] = Object.entries(dailyMap)
        .map(([date, stat]) => ({
          date,
          orders: n(stat.orders),
          revenue: n(stat.revenue)
        }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setInStats(format(inMap))
      setOutStats(format(outMap))
      setInRevenue(n(inRev))
      setOutRevenue(n(outRev))
      setDailyData(dailyStatArr)
      setOrderList((data as Order[]).sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e: any) {
      setErr(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [filterType, startDate, endDate])

  useEffect(() => {
    const id = localStorage.getItem('store_id')
    if (!id) return
    setStoreId(id)
  }, [])

  useEffect(() => {
    if (!storeId) return
    void fetchStats(storeId)
  }, [storeId, filterType, startDate, endDate, fetchStats])

  const manualRefresh = () => {
    if (storeId) void fetchStats(storeId)
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      {/* 頁首 */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">📊</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">銷售統計（內用 / 外帶）</h1>
            <p className="text-white/70 text-sm mt-1">按日期與品項維度，檢視營收趨勢與熱門排行</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={manualRefresh}
            className="inline-flex h-9 px-3 items-center rounded-md bg-white/10 text-white hover:bg-white/15 border border-white/15"
          >
            重新整理
          </button>
        </div>
      </div>

      {/* 區間選擇 */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 mb-6">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md overflow-hidden shadow">
            <button
              onClick={() => setFilterType('today')}
              className={`px-4 py-2 ${filterType === 'today' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
            >
              今日
            </button>
            <button
              onClick={() => setFilterType('week')}
              className={`px-4 py-2 ${filterType === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
            >
              本週
            </button>
            <button
              onClick={() => setFilterType('custom')}
              className={`px-4 py-2 ${filterType === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
            >
              自訂日期
            </button>
          </div>

          {filterType === 'custom' && (
            <>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border p-2 rounded"
              />
              <input
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
          >
            重新整理
          </button>
        </div>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 p-4">
          <div className="text-sm text-gray-500">總營收</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalRevenue)}</div>
          <div className="text-xs text-gray-400 mt-1">內用 {fmt(inRevenue)}・外帶 {fmt(outRevenue)}</div>
        </div>
        <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 p-4">
          <div className="text-sm text-gray-500">內用營收</div>
          <div className="text-2xl font-bold mt-1">{fmt(inRevenue)}</div>
        </div>
        <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 p-4">
          <div className="text-sm text-gray-500">訂單數</div>
          <div className="text-2xl font-bold mt-1">{totalOrders.toLocaleString('zh-TW')}</div>
        </div>
      </div>

      {/* 趨勢圖 */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 mb-6">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold">📈 銷售趨勢圖</h2>
        </div>
        <div className="p-4">
          {dailyData.length === 0 ? (
            <p className="text-gray-500">尚無資料</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: any, name: any) =>
                    name === '營收' ? fmt(value as number) : value
                  }
                />
                <Line type="monotone" dataKey="orders" stroke="#2563eb" name="訂單數" />
                <Line type="monotone" dataKey="revenue" stroke="#059669" name="營收" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 內用 / 外帶 排行 */}
      {[{ title: '內用訂單', stats: inStats, revenue: inRevenue },
        { title: '外帶訂單', stats: outStats, revenue: outRevenue }].map(section => (
        <div key={section.title} className="bg-white text-gray-900 rounded-lg shadow border border-gray-200 mb-6">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <div className="text-sm text-gray-600">💰 總營收：{fmt(section.revenue)}</div>
          </div>
          <div className="p-4">
            <table className="w-full border rounded overflow-hidden">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-4 py-2">品項</th>
                  <th className="text-right px-4 py-2">數量</th>
                  <th className="text-right px-4 py-2">總金額</th>
                </tr>
              </thead>
              <tbody>
                {section.stats.map(item => (
                  <tr key={item.name} className="border-t">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-right">{n(item.total)}</td>
                    <td className="px-4 py-2 text-right">{fmt(item.amount)}</td>
                  </tr>
                ))}
                {section.stats.length === 0 && (
                  <tr><td className="px-4 py-2 text-gray-500" colSpan={3}>尚無資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* 訂單明細 */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold">🧾 訂單明細</h2>
        </div>
        <div className="p-4">
          {orderList.length === 0 ? (
            <p className="text-gray-500">尚無訂單</p>
          ) : (
            <ul className="text-sm space-y-3">
              {orderList.map(order => (
                <li key={order.id} className="border rounded p-3">
                  <div className="text-gray-500 mb-1">
                    {dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
                  </div>
                  <div className="mb-1">
                    <span className="text-gray-600">桌號：</span>
                    {order.table_number || '-'}
                  </div>
                  <ul className="list-disc pl-5">
                    {order.items?.map((item, idx) => (
                      <li key={idx}>
                        {item.name} × {n(item.quantity)}（{fmt(lineTotal(item))}）
                      </li>
                    ))}
                  </ul>
                  {order.note && <div className="mt-1 text-gray-700">備註：{order.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 錯誤 / 載入 */}
      {loading && <p className="text-white/80 mt-3">讀取中…</p>}
      {err && <p className="text-red-400 mt-2">❌ {err}</p>}
    </div>
  )
}
