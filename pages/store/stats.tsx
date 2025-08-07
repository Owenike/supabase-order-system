import { useEffect, useState, useCallback } from 'react'
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
  price?: number // 可能有舊資料沒有 price
}

interface Order {
  id: string
  created_at: string
  table_number: string
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

  const fetchStats = useCallback(async (storeId: string) => {
    let fromISO = ''
    let toISO = dayjs().endOf('day').toISOString()

    if (filterType === 'today') {
      fromISO = dayjs().startOf('day').toISOString()
    } else if (filterType === 'week') {
      fromISO = dayjs().startOf('week').toISOString()
    } else if (filterType === 'custom' && startDate && endDate) {
      fromISO = dayjs(startDate).startOf('day').toISOString()
      toISO = dayjs(endDate).endOf('day').toISOString()
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .gte('created_at', fromISO)
      .lte('created_at', toISO)

    if (error || !data) return

    const inMap: Record<string, { quantity: number; amount: number }> = {}
    const outMap: Record<string, { quantity: number; amount: number }> = {}
    let inRev = 0
    let outRev = 0
    const dailyMap: Record<string, { orders: number; revenue: number }> = {}

    ;(data as Order[]).forEach((order) => {
      const isTakeout = order.table_number === '外帶'
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
  }, [filterType, startDate, endDate])

  useEffect(() => {
    const id = localStorage.getItem('store_id')
    if (!id) return
    setStoreId(id)
    fetchStats(id)
  }, [filterType, startDate, endDate, fetchStats])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📊 銷售統計（內用 / 外帶）</h1>

      <div className="mb-4 space-y-2">
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setFilterType('today')} className={`px-4 py-1 rounded border ${filterType === 'today' ? 'bg-blue-600 text-white' : ''}`}>今日</button>
          <button onClick={() => setFilterType('week')} className={`px-4 py-1 rounded border ${filterType === 'week' ? 'bg-blue-600 text-white' : ''}`}>本週</button>
          <button onClick={() => setFilterType('custom')} className={`px-4 py-1 rounded border ${filterType === 'custom' ? 'bg-blue-600 text-white' : ''}`}>自訂日期</button>
        </div>
        {filterType === 'custom' && (
          <div className="flex gap-3">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-1 rounded" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-1 rounded" />
          </div>
        )}
      </div>

      <div className="my-6">
        <h2 className="font-semibold mb-2">📈 銷售趨勢圖</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value: any, name: any) => name === '營收' ? fmt(value as number) : value} />
            <Line type="monotone" dataKey="orders" stroke="#8884d8" name="訂單數" />
            <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="營收" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {[{ title: '內用訂單', stats: inStats, revenue: inRevenue },
        { title: '外帶訂單', stats: outStats, revenue: outRevenue }].map(section => (
        <div key={section.title} className="mb-10">
          <h2 className="text-xl font-semibold mb-2">{section.title}</h2>
          <p className="mb-2">💰 總營收：{fmt(section.revenue)}</p>
          <table className="w-full border mt-2">
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
                <tr><td className="px-4 py-2" colSpan={3}>尚無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      <div className="mt-8">
        <h2 className="font-semibold mb-2">🧾 訂單明細</h2>
        <ul className="text-sm space-y-2">
          {orderList.map(order => (
            <li key={order.id} className="border rounded p-3">
              <div className="text-gray-500 mb-1">{dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}</div>
              <div className="mb-1">桌號：{order.table_number}</div>
              <ul className="list-disc pl-5">
                {order.items?.map((item, idx) => (
                  <li key={idx}>
                    {item.name} × {n(item.quantity)}（{fmt(lineTotal(item))}）
                  </li>
                ))}
              </ul>
              {order.note && <div className="mt-1">備註：{order.note}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
