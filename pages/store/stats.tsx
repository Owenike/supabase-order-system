// /pages/store/stats.tsx
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import dayjs from 'dayjs'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer
} from 'recharts'
import { useGuardStoreAccount } from '@/lib/guards/useGuardStoreAccount'

interface MenuItemStat { name: string; total: number; amount: number }
interface DailyStat    { date: string; orders: number; revenue: number }
interface OrderItem    { name: string; quantity: number; price?: number }
interface Order        { id: string; created_at: string; table_number: string | null; items: OrderItem[]; note?: string }

/** --------- 安全數值工具 ---------- */
const n = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0
const lineTotal = (item: OrderItem) => n(item.price) * n(item.quantity)
const fmt = (v: number) => `NT$ ${n(v).toLocaleString('zh-TW')}`

// 膠囊按鈕（深色卡上選中黃底、未選白/10）
const pill = (selected: boolean) =>
  selected
    ? 'bg-yellow-400 text-black border-yellow-400'
    : 'bg-white/10 text-white border border-white/15 hover:bg-white/15 transition'

// 重新整理圖示
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 12a8 8 0 10-2.34 5.66M20 12v5h-5" />
  </svg>
)

export default function StoreStatsPage() {
  // ✅ 改用守門 hook：未通過會自動導回 /login；通過後提供 storeId
  const { guarding, storeId } = useGuardStoreAccount()

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
  const totalOrders  = useMemo(() => dailyData.reduce((s, d) => s + n(d.orders), 0), [dailyData])

  const fetchStats = useCallback(async (sid: string) => {
    setLoading(true)
    setErr('')
    try {
      let fromISO = ''
      let toISO = dayjs().endOf('day').toISOString()

      if (filterType === 'today') {
        fromISO = dayjs().startOf('day').toISOString()
      } else if (filterType === 'week') {
        // 週一為起始
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

      const inMap:  Record<string, { quantity: number; amount: number }> = {}
      const outMap: Record<string, { quantity: number; amount: number }> = {}
      let inRev = 0, outRev = 0
      const dailyMap: Record<string, { orders: number; revenue: number }> = {}

      ;(data as Order[]).forEach((order) => {
        const s = String(order.table_number ?? '').trim().toLowerCase()
        const isTakeout = s === '外帶' || s === 'takeout' || s === '0'
        const date = dayjs(order.created_at).format('YYYY-MM-DD')
        if (!dailyMap[date]) dailyMap[date] = { orders: 0, revenue: 0 }
        dailyMap[date].orders++

        order.items?.forEach((item) => {
          const target = isTakeout ? outMap : inMap
          if (!target[item.name]) target[item.name] = { quantity: 0, amount: 0 }

          const qty = n(item.quantity)
          const amount = lineTotal(item)
          target[item.name].quantity += qty
          target[item.name].amount   += amount

          if (isTakeout) outRev += amount
          else inRev += amount
          dailyMap[date].revenue += amount
        })
      })

      const format = (map: typeof inMap) =>
        Object.entries(map)
          .map(([name, stat]) => ({ name, total: n(stat.quantity), amount: n(stat.amount) }))
          .sort((a, b) => b.amount - a.amount)

      const dailyStatArr: DailyStat[] = Object.entries(dailyMap)
        .map(([date, stat]) => ({ date, orders: n(stat.orders), revenue: n(stat.revenue) }))
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

  // ✅ 改為等 hook 放行後、且有 storeId 再拉資料
  useEffect(() => {
    if (guarding || !storeId) return
    void fetchStats(storeId)
  }, [guarding, storeId, filterType, startDate, endDate, fetchStats])

  const manualRefresh = () => { if (!guarding && storeId) void fetchStats(storeId) }

  // 守門中先不渲染內容，避免閃爍
  if (guarding) return null

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      {/* 頁首（深色） */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">📊</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">銷售統計（內用 / 外帶）</h1>
            <p className="text-white/70 text-sm mt-1">按日期與品項維度，檢視營收趨勢與熱門排行</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={manualRefresh} startIcon={<RefreshIcon />}>
            重新整理
          </Button>
        </div>
      </div>

      {/* 日期區間（深灰卡 + 膠囊） */}
      <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-6">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            <button className={`px-4 py-2 rounded-full ${pill(filterType === 'today')}`} onClick={() => setFilterType('today')}>今日</button>
            <button className={`px-4 py-2 rounded-full ${pill(filterType === 'week')}`}  onClick={() => setFilterType('week')}>本週</button>
            <button className={`px-4 py-2 rounded-full ${pill(filterType === 'custom')}`} onClick={() => setFilterType('custom')}>自訂日期</button>
          </div>

          {filterType === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                     className="border p-2 rounded bg-white text-gray-900" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                     className="border p-2 rounded bg-white text-gray-900" />
            </>
          )}

          <Button className="ml-auto" variant="soft" size="sm" onClick={manualRefresh} startIcon={<RefreshIcon />}>
            重新整理
          </Button>
        </div>
      </div>

      {/* KPI（深灰卡） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
          <div className="text-sm text-white/70">總營收</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalRevenue)}</div>
          <div className="text-xs text-white/60 mt-1">內用 {fmt(inRevenue)}・外帶 {fmt(outRevenue)}</div>
        </div>
        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
          <div className="text-sm text-white/70">內用營收</div>
          <div className="text-2xl font-bold mt-1">{fmt(inRevenue)}</div>
        </div>
        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
          <div className="text-sm text-white/70">訂單數</div>
          <div className="text-2xl font-bold mt-1">{totalOrders.toLocaleString('zh-TW')}</div>
        </div>
      </div>

      {/* 趨勢圖（深灰卡 + 深色 Tooltip / 座標軸） */}
      <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-6">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-lg font-semibold">📈 銷售趨勢圖</h2>
        </div>
        <div className="p-4">
          {dailyData.length === 0 ? (
            <p className="text-white/70">尚無資料</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dailyData}>
                <CartesianGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.8)' }} axisLine={{ stroke: 'rgba(255,255,255,0.3)' }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.8)' }} axisLine={{ stroke: 'rgba(255,255,255,0.3)' }} />
                <Tooltip
                  contentStyle={{ background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
                  labelStyle={{ color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: any, name: any) => (name === '營收' ? fmt(value as number) : value)}
                />
                <Line type="monotone" dataKey="orders"  stroke="#f59e0b" strokeWidth={2} dot={false} name="訂單數" />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="營收" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 內用 / 外帶 排行（深灰卡 + 白色表頭文字） */}
      {[{ title: '內用訂單', stats: inStats, revenue: inRevenue },
        { title: '外帶訂單', stats: outStats, revenue: outRevenue }].map(section => (
        <div key={section.title} className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 mb-6">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <div className="text-sm text-white/80">💰 總營收：{fmt(section.revenue)}</div>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full border border-white/10 rounded">
              <thead className="bg-white/10">
                <tr>
                  <th className="px-4 py-2 text-left  text-white">品項</th>
                  <th className="px-4 py-2 text-right text-white">數量</th>
                  <th className="px-4 py-2 text-right text-white">總金額</th>
                </tr>
              </thead>
              <tbody>
                {section.stats.map(item => (
                  <tr key={item.name} className="border-t border-white/10">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-right">{n(item.total).toLocaleString('zh-TW')}</td>
                    <td className="px-4 py-2 text-right">{fmt(item.amount)}</td>
                  </tr>
                ))}
                {section.stats.length === 0 && (
                  <tr><td className="px-4 py-2 text-white/70" colSpan={3}>尚無資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* 訂單明細（深灰卡） */}
      <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-lg font-semibold">🧾 訂單明細</h2>
        </div>
        <div className="p-4">
          {orderList.length === 0 ? (
            <p className="text-white/70">尚無訂單</p>
          ) : (
            <ul className="text-sm space-y-3">
              {orderList.map(order => (
                <li key={order.id} className="border border-white/10 rounded p-3">
                  <div className="text-white/60 mb-1">
                    {dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
                  </div>
                  <div className="mb-1">
                    <span className="text-white/70">桌號：</span>
                    {order.table_number || '-'}
                  </div>
                  <ul className="list-disc pl-5">
                    {order.items?.map((item, idx) => (
                      <li key={idx}>
                        {item.name} × {n(item.quantity)}（{fmt(lineTotal(item))}）
                      </li>
                    ))}
                  </ul>
                  {order.note && <div className="mt-1 text-white/80">備註：{order.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 載入／錯誤 */}
      {loading && <p className="text-white/80 mt-3">讀取中…</p>}
      {err && <p className="text-red-400 mt-2">❌ {err}</p>}
    </div>
  )
}
