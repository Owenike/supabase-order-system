import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import liff from '@line/liff'

// ✅ Cookie 讀取函式
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

interface MenuItem {
  id: string
  name: string
  price: number
  store_id: string
  category_id: string
  description?: string
  is_available?: boolean | null
}

interface Category {
  id: string
  name: string
}

interface OrderRecord {
  items: { id?: string; name: string; quantity: number; price: number }[]
  note: string
  total: number
  status?: string
  spicy_level?: string // ✅ 新增：辣度
}

const langMap = {
  zh: {
    title: '顧客點餐',
    takeaway: '外帶顧客點餐',
    notePlaceholder: '例如：不要香菜、先送湯、打包等',
    confirm: '確認訂單',
    total: '總計',
    success: '✅ 訂單已送出，請稍候送餐 🍽',
    fail: '送出訂單失敗，請稍後再試',
    back: '返回修改',
    submit: '送出訂單',
    name: '請輸入姓名（必填）',
    phone: '請輸入手機號碼（例如：0912345678）',
    errorNoItem: '請至少選擇一項餐點',
    errorName: '請輸入姓名',
    errorPhone: '請輸入有效的手機號碼（例如：0912345678）',
    confirmTitle: '📋 訂單確認',
    noteLabel: '備註（選填）',
    viewLast: '已點餐點',
    spicyLabel: '辣度（選填）',            // ✅ 新增文案
    spicyNone: '（不選）',
    spicyNo: '不辣',
    spicyLight: '小辣',
    spicyMedium: '中辣',
    spicyHot: '大辣',
    spicyPreview: '🌶️ 辣度'
  },
  en: {
    title: 'Dine-in Order',
    takeaway: 'Takeout Order',
    notePlaceholder: 'e.g. No cilantro, soup first, pack to-go',
    confirm: 'Confirm Order',
    total: 'Total',
    success: '✅ Order placed. Please wait. 🍽',
    fail: 'Failed to submit. Please try again.',
    back: 'Modify',
    submit: 'Submit Order',
    name: 'Enter your name (required)',
    phone: 'Enter valid mobile (e.g. 0912345678)',
    errorNoItem: 'Please select at least one item',
    errorName: 'Please enter your name',
    errorPhone: 'Please enter a valid mobile number',
    confirmTitle: '📋 Order Confirmation',
    noteLabel: 'Notes (optional)',
    viewLast: 'View Last Order',
    spicyLabel: 'Spicy Level (optional)',  // ✅ 新增文案
    spicyNone: '(None)',
    spicyNo: 'Mild / None',
    spicyLight: 'Light',
    spicyMedium: 'Medium',
    spicyHot: 'Hot',
    spicyPreview: '🌶️ Spicy'
  }
}

export default function OrderPage() {
  const router = useRouter()
  const { store: storeIdFromQuery, table: tableParam } = router.query
  const isTakeout = ['外帶', '0', 'takeout'].includes(String(tableParam))

  const [storeId, setStoreId] = useState('')
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedItems, setSelectedItems] = useState<{ id: string; name: string; price: number; quantity: number }[]>([])
  const [note, setNote] = useState('')
  const [spicyLevel, setSpicyLevel] = useState<string>('') // ✅ 新增：辣度狀態
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [showPrevious, setShowPrevious] = useState(false)
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([])
  const [isLiffReady, setIsLiffReady] = useState(false)
  const t = langMap[lang]
  const total = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  // ✅ 初始化 LIFF 並設定 line_user_id cookie
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: '2007831464' })
        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }

        const profile = await liff.getProfile()
        document.cookie = `line_user_id=${profile.userId}; path=/`
        setCustomerName(profile.displayName || '')
        console.log('✅ LIFF 初始化完成:', profile)
        setIsLiffReady(true)
      } catch (err) {
        console.error('❌ LIFF 初始化錯誤:', err)
        setIsLiffReady(true) // 即使失敗也避免卡畫面
      }
    }

    if (isTakeout) {
      initLiff()
    } else {
      setIsLiffReady(true)
    }
  }, [isTakeout])

  // ✅ 若缺少 cookie 就記錄 log（需等 LIFF 初始化完成）
  useEffect(() => {
    if (!isLiffReady) return
    const lineUserId = getCookie('line_user_id')
    const storeParam = typeof router.query.store === 'string' ? router.query.store : 'unknown'
    if (isTakeout && !lineUserId) {
      supabase.from('login_logs').insert({
        line_user_id: 'MISSING',
        error_message: 'line_user_id not found in cookie',
        user_agent: navigator.userAgent,
        store_id: storeParam
      })
    }
  }, [router.query, isLiffReady])

  const fetchOrders = useCallback(async () => {
    const lineUserId = getCookie('line_user_id')
    let query = supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (isTakeout) {
      if (lineUserId) {
        query = query.eq('line_user_id', lineUserId)
      } else {
        setOrderHistory([])
        return
      }
    } else {
      query = query.eq('table_number', tableParam)
    }

    const { data, error } = await query
    if (error) console.error('fetchOrders error:', error)
    if (data) setOrderHistory(data as OrderRecord[])
  }, [storeId, tableParam, isTakeout])

  useEffect(() => {
    if (typeof storeIdFromQuery === 'string') {
      setStoreId(storeIdFromQuery)
    }
  }, [storeIdFromQuery])

  useEffect(() => {
    if (!isLiffReady) return
    if (storeId) {
      fetchMenus(storeId)
      fetchCategories(storeId)
      fetchOrders()
    }
  }, [storeId, fetchOrders, isLiffReady])

  const fetchMenus = async (storeId: string) => {
    if (!storeId) return
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('store_id', storeId)
      .or('is_available.eq.true,is_available.is.null')
      .order('created_at', { ascending: true })
    if (error) console.error('❌ fetchMenus error:', error.message)
    if (data) setMenus(data)
  }

  const fetchCategories = async (storeId: string) => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true })
    if (error) console.error('fetchCategories error:', error.message)
    if (data) setCategories(data)
  }

  const toggleItem = (menu: MenuItem) => {
    const exists = selectedItems.find(i => i.id === menu.id)
    if (exists) {
      setSelectedItems(selectedItems.map(i =>
        i.id === menu.id ? { ...i, quantity: i.quantity + 1 } : i
      ))
    } else {
      setSelectedItems([...selectedItems, {
        id: menu.id,
        name: menu.name,
        price: menu.price,
        quantity: 1
      }])
    }
  }

  const reduceItem = (id: string) => {
    setSelectedItems(selectedItems
      .map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i)
      .filter(i => i.quantity > 0)
    )
  }

  const handleConfirm = () => {
    if (selectedItems.length === 0) return setErrorMsg(t.errorNoItem)
    if (isTakeout) {
      if (!customerName.trim()) return setErrorMsg(t.errorName)
      if (!/^09\d{8}$/.test(customerPhone.trim())) return setErrorMsg(t.errorPhone)
    }
    setErrorMsg('')
    setConfirming(true)
  }

  const submitOrder = async () => {
    if (!storeId || typeof tableParam !== 'string') return
    const noteText = isTakeout
      ? `姓名：${customerName} | 電話：${customerPhone}${note ? ` | 備註：${note}` : ''}`
      : note

    const totalAmount = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const lineUserId = getCookie('line_user_id')
    const storeParam = typeof router.query.store === 'string' ? router.query.store : 'unknown'

    const payload: Record<string, any> = {
      store_id: storeId,
      table_number: tableParam,
      items: selectedItems,
      note: noteText,
      status: 'pending',
      total: totalAmount,
      line_user_id: lineUserId || null
    }

    // ✅ 新增：帶入辣度，有選擇才送
    if (spicyLevel && spicyLevel.trim()) {
      payload.spicy_level = spicyLevel.trim()
    }

    const { error } = await supabase.from('orders').insert(payload)

    if (error) {
      setErrorMsg(`${t.fail}（${error.message}）`)
      console.error('submitOrder error:', error)

      // ✅ 上報錯誤 log 到 login_logs 表
      const userAgent = navigator.userAgent
      await supabase.from('login_logs').insert({
        line_user_id: lineUserId || 'unknown',
        error_message: error.message || 'Unknown error',
        user_agent: userAgent,
        store_id: storeParam
      })

      return
    }

    setSuccess(true)
    fetchOrders()
    setSelectedItems([])
    setNote('')
    setSpicyLevel('') // ✅ 送出後清空辣度
    setCustomerName('')
    setCustomerPhone('')
    setConfirming(false)
  }

  if (!storeId || !isLiffReady) {
    return <p className="text-red-500 p-4">❗請稍候，頁面初始化中…</p>
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        className="absolute top-4 right-4 text-sm border px-2 py-1 rounded"
      >
        {lang === 'zh' ? 'EN' : '中'}
      </button>

      <h1 className="text-2xl font-bold mb-4">
        {isTakeout ? `🛍 ${t.takeaway}` : `📝 ${t.title}`}
      </h1>

      {isTakeout && !getCookie('line_user_id') && (
        <div className="mb-6 text-red-600 text-sm">
          尚未成功登入 LINE，請重新整理頁面或稍候再試
        </div>
      )}

      {success && (
        <div className="bg-green-100 text-green-700 p-3 rounded mb-4 shadow">
          {t.success}
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4 shadow">
          ❌ {errorMsg}
        </div>
      )}

      {!confirming ? (
        <>
          {orderHistory.length > 0 && (
            <button
              onClick={() => setShowPrevious(!showPrevious)}
              className="mb-4 px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
            >
              📋 {t.viewLast}
            </button>
          )}

          {showPrevious && (
            <div className="mb-6 space-y-4">
              {orderHistory.map((order, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-300 p-4 rounded">
                  <h2 className="font-semibold mb-2">
                    {t.confirmTitle}（第 {idx + 1} 筆）
                  </h2>
                  <ul className="list-disc pl-5 text-sm mb-2">
                    {order.items.map((item, i) => (
                      <li key={i}>
                        {item.name} × {item.quantity}（NT$ {item.price}）
                      </li>
                    ))}
                  </ul>
                  {order.spicy_level && (
                    <p className="text-sm text-red-600 mb-1">
                      {t.spicyPreview}：{order.spicy_level}
                    </p>
                  )}
                  {order.note && <p className="text-sm text-gray-700 mb-2">📝 {order.note}</p>}
                  <p className="font-bold">總計：NT$ {order.total}</p>
                </div>
              ))}
            </div>
          )}

          {categories.map(cat => (
            <div key={cat.id} className="mb-6">
              <h2 className="text-xl font-semibold mb-2 border-l-4 pl-2 border-yellow-400 text-yellow-700">{cat.name}</h2>
              <ul className="grid gap-4">
                {menus.filter(m => String(m.category_id) === String(cat.id)).map(menu => (
                  <li key={menu.id} className="border rounded-lg p-4 shadow hover:shadow-md transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-lg mb-1">{menu.name}</div>
                        <div className="text-sm text-gray-600">NT$ {menu.price}</div>
                        {menu.description && (
                          <div className="text-xs text-gray-400 mt-1">{menu.description}</div>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => reduceItem(menu.id)}
                          className="w-8 h-8 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          －
                        </button>
                        <span className="min-w-[20px] text-center">
                          {selectedItems.find(i => i.id === menu.id)?.quantity || 0}
                        </span>
                        <button
                          onClick={() => toggleItem(menu)}
                          className="w-8 h-8 bg-green-500 text-white rounded-full hover:bg-green-600"
                        >
                          ＋
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {isTakeout && (
            <div className="mb-6 space-y-2">
              <input
                className="w-full border p-2 rounded"
                placeholder={t.name}
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full border p-2 rounded"
                placeholder={t.phone}
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
              />
            </div>
          )}

          {/* ✅ 辣度選擇（內用/外帶皆顯示，選填） */}
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">{t.spicyLabel}</label>
            <select
              className="w-full border p-2 rounded"
              value={spicyLevel}
              onChange={(e) => setSpicyLevel(e.target.value)}
            >
              <option value="">{t.spicyNone}</option>
              <option value={lang === 'zh' ? '不辣' : 'Mild / None'}>{t.spicyNo}</option>
              <option value={lang === 'zh' ? '小辣' : 'Light'}>{t.spicyLight}</option>
              <option value={lang === 'zh' ? '中辣' : 'Medium'}>{t.spicyMedium}</option>
              <option value={lang === 'zh' ? '大辣' : 'Hot'}>{t.spicyHot}</option>
            </select>
          </div>

          <div className="mb-6">
            <h2 className="font-semibold mb-2">{t.noteLabel}</h2>
            <textarea
              className="w-full border p-2 rounded"
              rows={1}
              placeholder={t.notePlaceholder}
              value={note}
              onChange={e => {
                const value = e.target.value
                if (value.length <= 100) setNote(value)
              }}
              onInput={e => {
                const el = e.target as HTMLTextAreaElement
                el.style.height = 'auto'
                el.style.height = el.scrollHeight + 'px'
              }}
            />
            <p className="text-xs text-gray-400 text-right">{note.length}/100</p>
          </div>

          <div className="sticky bottom-4 bg-white pt-4 pb-2">
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold">{t.total}：NT$ {total}</span>
              <button onClick={handleConfirm} className="bg-yellow-500 text-white px-6 py-2 rounded">
                {t.confirm}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white border rounded p-4 shadow">
          <h2 className="text-lg font-bold mb-2">{t.confirmTitle}</h2>
          <ul className="list-disc pl-5 text-sm mb-3">
            {selectedItems.map((item, idx) => (
              <li key={idx}>
                {item.name} × {item.quantity}（NT$ {item.price}）
              </li>
            ))}
          </ul>
          {spicyLevel && (
            <p className="text-sm text-red-600 mb-1">
              {t.spicyPreview}：{spicyLevel}
            </p>
          )}
          {isTakeout && (
            <>
              <p className="text-sm text-gray-700 mb-1">👤 姓名：{customerName}</p>
              <p className="text-sm text-gray-700 mb-1">📞 電話：{customerPhone}</p>
            </>
          )}
          {note && <p className="text-sm text-gray-700 mb-3">📝 備註：{note}</p>}
          <p className="font-bold mb-4">{t.total}：NT$ {total}</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded border">
              {t.back}
            </button>
            <button onClick={submitOrder} className="px-4 py-2 rounded bg-blue-600 text-white">
              {t.submit}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
