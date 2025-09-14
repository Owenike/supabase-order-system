/* eslint-disable no-console */
import dynamic from 'next/dynamic'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import { getLiff } from '@/lib/liffClient'
import { fetchItemOptions, type OptionGroup } from '@/utils/fetchItemOptions'
import ItemOptionPicker from '@/components/ItemOptionPicker'

// ---------- 常數與工具 ----------
const SAVED_QS_KEY = 'order_return_qs'
const SAVED_STORE_KEY = 'order_store'
const SAVED_TABLE_KEY = 'order_table'
const REDIRECT_URI_BASE = 'https://www.olinex.app/order' // 清參數時用
const COOKIE_QS_KEY = 'order_qs_backup'
const FLAG_RETURNED = 'liff_returned_once'
const COOKIE_DOMAIN = '.olinex.app'

// 可從 .env 帶入（避免沒有 query 時無處可還原）
const FALLBACK_STORE_ID =
  process.env.NEXT_PUBLIC_FALLBACK_STORE_ID || '11b687d8-f529-4da0-b901-74d5e783e6f2'
const FALLBACK_TABLE = process.env.NEXT_PUBLIC_FALLBACK_TABLE || '外帶'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type OptionsMap = Record<string, string | string[]>

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
function setCookie(name: string, value: string, maxAgeSec = 600) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; Max-Age=${maxAgeSec}; Path=/; Domain=${COOKIE_DOMAIN}; SameSite=Lax; Secure`
}
function delCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${COOKIE_DOMAIN}; SameSite=Lax; Secure`
}
function parseQS(qs: string): Record<string, string> {
  const out: Record<string, string> = {}
  const p = new URLSearchParams(qs.startsWith('?') ? qs : `?${qs}`)
  p.forEach((v, k) => (out[k] = v))
  return out
}
function safeWindow(): Window | null {
  return typeof window !== 'undefined' ? window : null
}

// 從 router / 目前網址 / cookie / session / local / fallback 蒐集目標 store/table
function resolveTarget(w: Window, q: Record<string, any>) {
  let store: string | undefined
  let table: string | undefined
  const src: string[] = []

  if (typeof q.store === 'string' && q.store) {
    store = q.store
    src.push('router.store')
  }
  if (typeof q.table === 'string' && q.table) {
    table = q.table
    src.push('router.table')
  }

  if ((!store || !table) && w.location.search) {
    const p = new URLSearchParams(w.location.search)
    if (!store && p.get('store')) {
      store = p.get('store') || undefined
      src.push('search.store')
    }
    if (!table && p.get('table')) {
      table = p.get('table') || undefined
      src.push('search.table')
    }
  }

  const cookieQs = getCookie(COOKIE_QS_KEY)
  if ((!store || !table) && cookieQs) {
    const p = new URLSearchParams(cookieQs.startsWith('?') ? cookieQs : `?${cookieQs}`)
    if (!store && p.get('store')) {
      store = p.get('store') || undefined
      src.push('cookie.store')
    }
    if (!table && p.get('table')) {
      table = p.get('table') || undefined
      src.push('cookie.table')
    }
  }

  const savedQs = w.sessionStorage.getItem(SAVED_QS_KEY) || ''
  if ((!store || !table) && savedQs) {
    const p = new URLSearchParams(savedQs.startsWith('?') ? savedQs : `?${savedQs}`)
    if (!store && p.get('store')) {
      store = p.get('store') || undefined
      src.push('session.store')
    }
    if (!table && p.get('table')) {
      table = p.get('table') || undefined
      src.push('session.table')
    }
  }

  if (!store) {
    const s = w.localStorage.getItem(SAVED_STORE_KEY) || ''
    if (s) {
      store = s
      src.push('local.store')
    }
  }
  if (!table) {
    const t = w.localStorage.getItem(SAVED_TABLE_KEY) || ''
    if (t) {
      table = t
      src.push('local.table')
    }
  }

  if (!store && FALLBACK_STORE_ID) {
    store = FALLBACK_STORE_ID
    src.push('fallback.store')
  }
  if (!table && FALLBACK_TABLE) {
    table = FALLBACK_TABLE
    src.push('fallback.table')
  }

  return { store, table, src }
}

// 僅保留 store/table，清掉 code/state 等授權參數 → /order
function buildCleanRedirectUrl(w: Window, q: Record<string, any>) {
  const { store, table, src } = resolveTarget(w, q)
  const sp = new URLSearchParams()
  if (store) sp.set('store', store)
  if (table) sp.set('table', table)
  const url = sp.toString() ? `${REDIRECT_URI_BASE}?${sp.toString()}` : REDIRECT_URI_BASE
  console.log('[LIFF] buildCleanRedirectUrl ->', url, 'sources=', src)
  return url
}

// 登入回跳 → /line-success（由該頁清參數，再回 /order）
function buildSuccessRedirectUrl(w: Window, q: Record<string, any>) {
  const { store, table } = resolveTarget(w, q)
  const sp = new URLSearchParams()
  if (store) sp.set('store', store)
  if (table) sp.set('table', table)
  return sp.toString()
    ? `https://www.olinex.app/line-success?${sp.toString()}`
    : `https://www.olinex.app/line-success`
}

// ---------- 型別 ----------
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
interface OrderItem {
  id?: string
  name: string
  quantity: number
  price: number
  options?: OptionsMap | null
}
interface OrderRecord {
  items: OrderItem[]
  note: string
  total: number
  status?: string
  spicy_level?: string
  created_at?: string
}

// ---------- 多語系 ----------
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
    spicyLabel: '辣度（選填）',
    spicyNone: '（不選）',
    spicyNo: '不辣',
    spicyLight: '小辣',
    spicyMedium: '中辣',
    spicyHot: '大辣',
    spicyPreview: '🌶️ 辣度',
    invalidStore: '店家 ID 無效，請確認網址中的 store 參數是否為正確的 UUID。',
    dineInBlocked: '本店目前已暫停「內用」，僅提供外帶服務。你可以改為外帶繼續下單。',
    takeoutBlocked: '本店目前已暫停「外帶」，暫不接受外帶點餐。'
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
    phone: 'Enter a valid mobile (e.g. 0912345678)',
    errorNoItem: 'Please select at least one item',
    errorName: 'Please enter your name',
    errorPhone: 'Please enter a valid mobile number',
    confirmTitle: '📋 Order Confirmation',
    noteLabel: 'Notes (optional)',
    viewLast: 'View Last Order',
    spicyLabel: 'Spicy Level (optional)',
    spicyNone: '(None)',
    spicyNo: 'Mild / None',
    spicyLight: 'Light',
    spicyMedium: 'Medium',
    spicyHot: 'Hot',
    spicyPreview: '🌶️ Spicy',
    invalidStore: 'Invalid store ID. Please ensure the "store" query param is a valid UUID.',
    dineInBlocked: 'Dine-in is currently unavailable. Please switch to takeout to continue.',
    takeoutBlocked: 'Takeout is currently unavailable. We are not accepting takeout orders now.'
  }
}

// ---------- 舊資料鍵值的中文對應（防呆用） ----------
function translateOptionPair(key: string, value: string | string[]): { k: string; v: string } {
  const toText = (x: any) => String(x ?? '').trim()
  const V = Array.isArray(value) ? value.map(toText) : [toText(value)]
  let k = key
  // key 映射
  if (key === 'fixed_sweetness') k = '甜度'
  else if (key === 'fixed_ice') k = '冰塊'
  else if (key === 'fixed_size') k = '容量'
  else if (/^[0-9a-f-]{24,}$/.test(key)) k = '加料' // 可能是選項組/值的 UUID，統一稱「加料」

  // value 映射（只針對舊資料常見值，新的會直接是中文）
  const mapSweet: Record<string, string> = { '0': '無糖', '30': '微糖', '50': '半糖', '70': '少糖', '100': '全糖' }
  const mapIce: Record<string, string> = { '0': '去冰', '30': '微冰', '50': '少冰', '100': '正常冰' }
  const mapSize: Record<string, string> = { S: '小杯', M: '中杯', L: '大杯' }

  let vText = V.join('、')
  if (key === 'fixed_sweetness') vText = V.map((x) => mapSweet[x] || x).join('、')
  if (key === 'fixed_ice') vText = V.map((x) => mapIce[x] || x).join('、')
  if (key === 'fixed_size') vText = V.map((x) => mapSize[x] || x).join('、')

  return { k, v: vText }
}

function renderOptionsList(opts?: OptionsMap | null) {
  if (!opts || typeof opts !== 'object') return null
  const entries = Object.entries(opts)
  if (!entries.length) return null
  return (
    <ul className="ml-4 text-sm text-gray-600 list-disc">
      {entries.map(([rawK, rawV]) => {
        const { k, v } = translateOptionPair(rawK, rawV)
        return (
          <li key={rawK}>
            {k}：{v}
          </li>
        )
      })}
    </ul>
  )
}

// ---------- Page ----------
function OrderPage() {
  const router = useRouter()
  const routerReady = router.isReady
  const { store: storeIdFromQuery, table: tableParam, code, state, liffRedirectUri } = router.query

  const tableStr = String(tableParam ?? '')
  const isTakeout = useMemo(() => ['外帶', '0', 'takeout'].includes(tableStr), [tableStr])

  const effectiveTable = useMemo(() => {
    if (typeof tableParam === 'string' && tableParam) return tableParam
    return isTakeout ? 'takeout' : ''
  }, [tableParam, isTakeout])

  const [storeId, setStoreId] = useState('')
  const [invalidStore, setInvalidStore] = useState(false)

  const [menus, setMenus] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedItems, setSelectedItems] = useState<
    { id: string; name: string; price: number; quantity: number; options?: OptionsMap | null }[]
  >([])
  const [note, setNote] = useState('')
  const [spicyLevel, setSpicyLevel] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [showPrevious, setShowPrevious] = useState(false)
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([])
  const [isLiffReady, setIsLiffReady] = useState(false)
  const [qsRestored, setQsRestored] = useState(false)
  const [liffRef, setLiffRef] = useState<any>(null)
  const [hasLineCookie, setHasLineCookie] = useState<boolean>(!!getCookie('line_user_id'))
  const [loggingIn, setLoggingIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // === 商品選項狀態 ===
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([])
  const [chosenOptions, setChosenOptions] = useState<Record<string, string | string[]>>({})
  const [activeMenu, setActiveMenu] = useState<MenuItem | null>(null)

  // 內用/外帶旗標
  const [dineInEnabled, setDineInEnabled] = useState<boolean>(true)
  const [takeoutEnabled, setTakeoutEnabled] = useState<boolean>(true)
  const [flagsLoaded, setFlagsLoaded] = useState<boolean>(false)

  const t = langMap[lang]
  const total = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [selectedItems]
  )

  // 取得 LINE user cookie
  const ensureLineCookie = useCallback(async () => {
    try {
      const liff = liffRef
      if (!liff || !liff.isLoggedIn()) return
      if (getCookie('line_user_id')) {
        setHasLineCookie(true)
        return
      }
      const decoded: any = liff.getDecodedIDToken?.()
      const sub: string | undefined = decoded?.sub
      if (sub) {
        setCookie('line_user_id', sub, 7 * 24 * 3600)
        setHasLineCookie(true)
      }
      try {
        const profile = await liff.getProfile()
        if (profile?.userId) {
          setCookie('line_user_id', profile.userId, 7 * 24 * 3600)
          setHasLineCookie(true)
          if (profile.displayName) setCustomerName((prev) => prev || profile.displayName)
        }
      } catch {}
    } catch (e) {
      console.warn('ensureLineCookie failed:', e)
    }
  }, [liffRef])

  // ---------- 初始化 LIFF ----------
  useEffect(() => {
    const w = safeWindow()
    if (!w || !routerReady) return
    let disposed = false

    ;(async () => {
      try {
        if (router.query.__debug_noliff === '1') {
          setIsLiffReady(true)
          return
        }

        const hasAuthParams = typeof code === 'string' && typeof state === 'string'
        if (hasAuthParams) {
          try {
            w.sessionStorage.setItem(FLAG_RETURNED, '1')
          } catch {}
        }

        const liff = await getLiff()
        setLiffRef(liff)
        try {
          await (liff as any).ready
        } catch {}

        if (liff.isLoggedIn()) {
          await ensureLineCookie()
          if (hasAuthParams) {
            const cleanUrl = buildCleanRedirectUrl(w, router.query)
            router.replace(cleanUrl)
          }
          if (!disposed) setIsLiffReady(true)
          return
        }

        if (hasAuthParams) {
          const cleanUrl = buildCleanRedirectUrl(w, router.query)
          router.replace(cleanUrl)
        }
        if (!disposed) setIsLiffReady(true)
      } catch (e) {
        console.error('LIFF init error:', e)
        setIsLiffReady(true)
      }
    })()

    return () => {
      disposed = true
    }
  }, [routerReady, router.query, code, state, ensureLineCookie, router])

  // ---------- 回跳後：若缺 store/table 就還原 ----------
  useEffect(() => {
    if (!routerReady || qsRestored) return
    const w = safeWindow()
    if (!w) return

    const hasStore = typeof router.query.store === 'string'
    const hasTable = typeof router.query.table === 'string'
    const hasCode = typeof code === 'string'

    if (hasCode && (!hasStore || !hasTable)) {
      const cookieQs = getCookie(COOKIE_QS_KEY)
      if (cookieQs) {
        router.replace(`/order${cookieQs}`)
        delCookie(COOKIE_QS_KEY)
        setQsRestored(true)
        return
      }

      if (typeof liffRedirectUri === 'string' && liffRedirectUri) {
        try {
          const decoded = decodeURIComponent(liffRedirectUri as string)
          const u = new URL(decoded)
          const s = u.searchParams.get('store')
          const t2 = u.searchParams.get('table')
          if (s && t2) {
            router.replace(`/order?store=${encodeURIComponent(s)}&table=${encodeURIComponent(t2)}`)
            setQsRestored(true)
            return
          }
        } catch {}
      }

      const savedQs = w.sessionStorage.getItem(SAVED_QS_KEY) || ''
      if (savedQs) {
        const parsed = parseQS(savedQs)
        const s = parsed.store || FALLBACK_STORE_ID
        const t2 = parsed.table || FALLBACK_TABLE
        router.replace(`/order?store=${encodeURIComponent(s)}&table=${encodeURIComponent(t2)}`)
        w.sessionStorage.removeItem(SAVED_QS_KEY)
        setQsRestored(true)
        return
      }

      const s2 = w.localStorage.getItem(SAVED_STORE_KEY) || FALLBACK_STORE_ID
      const t3 = w.localStorage.getItem(SAVED_TABLE_KEY) || FALLBACK_TABLE
      router.replace(`/order?store=${encodeURIComponent(s2)}&table=${encodeURIComponent(t3)}`)
      setQsRestored(true)
      return
    }
  }, [routerReady, router.query, code, liffRedirectUri, router, qsRestored])

  // ---------- 監聽 query 變化，寫入 storeId ----------
  useEffect(() => {
    const w = safeWindow()
    const candidate =
      (typeof storeIdFromQuery === 'string' && storeIdFromQuery) ||
      (w ? w.localStorage.getItem(SAVED_STORE_KEY) || FALLBACK_STORE_ID : FALLBACK_STORE_ID)

    if (candidate) {
      const ok = UUID_RE.test(candidate)
      setInvalidStore(!ok)
      if (ok) {
        setStoreId(candidate)
        if (w) w.localStorage.setItem(SAVED_STORE_KEY, candidate)
      } else {
        setStoreId('')
      }
    } else {
      setInvalidStore(true)
      setStoreId('')
    }
  }, [storeIdFromQuery])

  // ---------- 讀取「內用/外帶 是否開放」旗標（一次抓兩個） ----------
  const fetchFeatureFlags = useCallback(
    async (sid: string) => {
      if (!UUID_RE.test(sid)) {
        setDineInEnabled(true)
        setTakeoutEnabled(true)
        setFlagsLoaded(true)
        return
      }
      const { data, error } = await supabase
        .from('store_feature_flags')
        .select('feature_key, enabled')
        .eq('store_id', sid)
        .in('feature_key', ['dine_in', 'takeout'])

      if (error) {
        console.warn('fetchFeatureFlags error:', error.message)
        setDineInEnabled(true)
        setTakeoutEnabled(true)
      } else {
        const map = new Map<string, boolean>()
        ;(data || []).forEach((r: any) => map.set(r.feature_key, !!r.enabled))
        setDineInEnabled(map.has('dine_in') ? !!map.get('dine_in') : true)
        setTakeoutEnabled(map.has('takeout') ? !!map.get('takeout') : true)
      }
      setFlagsLoaded(true)
    },
    []
  )

  // ---------- 資料載入 ----------
  const fetchOrders = useCallback(async () => {
    if (!storeId || !UUID_RE.test(storeId)) return
    const lineUserId = getCookie('line_user_id')

    const SINCE_DAYS = 60
    const sinceIso = new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    let q = supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .gte('created_at', sinceIso)
      .not('status', 'in', '("completed","canceled")')
      .order('created_at', { ascending: false })

    if (isTakeout) {
      if (!lineUserId) {
        setOrderHistory([])
        return
      }
      q = q.eq('line_user_id', lineUserId).limit(20)
    } else {
      if (typeof tableParam !== 'string' || !tableParam) {
        setOrderHistory([])
        return
      }
      q = q.eq('table_number', tableParam).limit(10)
    }

    const { data, error } = await q
    if (error) {
      console.error('fetchOrders error:', error)
      return
    }
    setOrderHistory((data || []) as unknown as OrderRecord[])
  }, [storeId, tableParam, isTakeout])

  const fetchMenus = async (sid: string) => {
    if (!UUID_RE.test(sid)) return
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('store_id', sid)
      .or('is_available.eq.true,is_available.is.null')
      .order('created_at', { ascending: true })
    if (error) {
      console.error('fetchMenus error:', error.message)
      return
    }
    if (data) setMenus(data as unknown as MenuItem[])
  }

  const fetchCategories = async (sid: string) => {
    if (!UUID_RE.test(sid)) return
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('fetchCategories error:', error.message)
      return
    }
    if (data) setCategories(data as unknown as Category[])
  }

  useEffect(() => {
    if (!storeId || !UUID_RE.test(storeId)) return
    ;(async () => {
      await fetchFeatureFlags(storeId)
    })()
  }, [storeId, fetchFeatureFlags])

  useEffect(() => {
    if (!isLiffReady || !storeId || !UUID_RE.test(storeId) || !flagsLoaded) return
    ;(async () => {
      if (liffRef?.isLoggedIn?.() && !getCookie('line_user_id')) {
        await ensureLineCookie()
      }
      await fetchMenus(storeId)
      await fetchCategories(storeId)
      await fetchOrders()
    })()
  }, [isLiffReady, storeId, fetchOrders, ensureLineCookie, liffRef, flagsLoaded])

  // ---------- UI 事件 ----------
  // 點餐：先讀取商品選項（有選項→彈窗；沒選項→直接 +1）
  const toggleItem = async (menu: MenuItem) => {
    try {
      const groups = await fetchItemOptions(menu.id)
      if (!groups || groups.length === 0) {
        const exists = selectedItems.find((i) => i.id === menu.id)
        if (exists) {
          setSelectedItems(
            selectedItems.map((i) => (i.id === menu.id ? { ...i, quantity: i.quantity + 1 } : i))
          )
        } else {
          setSelectedItems((prev) => [
            ...prev,
            { id: menu.id, name: menu.name, price: menu.price, quantity: 1 }
          ])
        }
        return
      }
      setOptionGroups(groups)
      setChosenOptions({})
      setActiveMenu(menu)
    } catch (e) {
      console.error('fetchItemOptions error:', e)
      const exists = selectedItems.find((i) => i.id === menu.id)
      if (exists) {
        setSelectedItems(
          selectedItems.map((i) => (i.id === menu.id ? { ...i, quantity: i.quantity + 1 } : i))
        )
      } else {
        setSelectedItems((prev) => [
          ...prev,
          { id: menu.id, name: menu.name, price: menu.price, quantity: 1 }
        ])
      }
    }
  }

  const reduceItem = (id: string) => {
    setSelectedItems(
      selectedItems
        .map((i) => (i.id === id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0)
    )
  }

  // 在彈窗中按「加入」：把中文群組名 + 中文選項標籤寫入 options
  const addToCart = () => {
    if (!activeMenu) return
    const missing = optionGroups.find((g) => g.required && !chosenOptions[g.id])
    if (missing) {
      alert(`請選擇 ${missing.name}`)
      return
    }

    // 計算加價
    let delta = 0
    optionGroups.forEach((g) => {
      const val = chosenOptions[g.id]
      if (!val) return
      if (g.input_type === 'single') {
        const v = g.values.find((x) => x.value === val)
        if (v?.price_delta) delta += v.price_delta
      } else {
        ;(val as string[]).forEach((vv) => {
          const v = g.values.find((x) => x.value === vv)
          if (v?.price_delta) delta += v.price_delta
        })
      }
    })
    const finalPrice = activeMenu.price + delta

    // 產生「中文友善」的 options
    const displayOptions: OptionsMap = {}
    optionGroups.forEach((g) => {
      const val = chosenOptions[g.id]
      if (!val) return
      if (g.input_type === 'single') {
        const found = g.values.find((x) => x.value === val)
        const label = (found?.label ?? found?.value ?? '').toString().trim()
        if (label) displayOptions[g.name] = label
      } else {
        const labels = (val as string[])
          .map((vv) => {
            const f = g.values.find((x) => x.value === vv)
            return (f?.label ?? f?.value ?? '').toString().trim()
          })
          .filter(Boolean)
        if (labels.length) displayOptions[g.name] = labels
      }
    })

    setSelectedItems((prev) => [
      ...prev,
      {
        id: activeMenu.id,
        name: activeMenu.name,
        price: finalPrice,
        quantity: 1,
        ...(Object.keys(displayOptions).length ? { options: displayOptions } : {})
      }
    ])
    setActiveMenu(null)
  }

  const handleConfirm = () => {
    if (selectedItems.length === 0) return setErrorMsg(t.errorNoItem)
    if (isTakeout) {
      if (!takeoutEnabled && flagsLoaded) {
        setErrorMsg(t.takeoutBlocked)
        return
      }
      if (!customerName.trim()) return setErrorMsg(t.errorName)
      if (!/^09\d{8}$/.test(customerPhone.trim())) return setErrorMsg(t.errorPhone)
    } else {
      if (flagsLoaded && !dineInEnabled) {
        setErrorMsg(t.dineInBlocked)
        return
      }
    }
    setErrorMsg('')
    setConfirming(true)
  }

  const switchToTakeout = () => {
    const q = new URLSearchParams(router.asPath.split('?')[1] || '')
    q.set('table', 'takeout')
    if (storeId) q.set('store', storeId)
    router.replace(`/order?${q.toString()}`)
  }

  const handleManualLogin = async () => {
    const w = safeWindow()
    if (!w || loggingIn) return
    setLoggingIn(true)
    try {
      let liff = liffRef
      if (!liff) {
        liff = await getLiff()
        setLiffRef(liff)
        try {
          await (liff as any).ready
        } catch {}
      }
      if (liff?.isLoggedIn?.()) {
        await ensureLineCookie()
        await fetchOrders()
        return
      }

      try {
        w.sessionStorage.setItem('ALLOW_LIFF_LOGIN', '1')
      } catch {}

      const successUrl = buildSuccessRedirectUrl(w, router.query)
      const sp = new URLSearchParams(w.location.search || '')
      if (sp.get('code') || sp.get('state')) {
        await router.replace(successUrl)
        setTimeout(() => {
          ;(liff as any)?.login?.({ redirectUri: successUrl, botPrompt: 'aggressive' })
        }, 60)
        return
      }

      await (liff as any).login({ redirectUri: successUrl, botPrompt: 'aggressive' })
    } catch (err: any) {
      console.error('[LIFF] Manual login failed:', err?.message || err)
      setErrorMsg('LINE 登入失敗，請關閉分頁重開或改用 LINE 內建瀏覽器再試')
    } finally {
      setLoggingIn(false)
    }
  }

  // === 呼叫 /api/orders/create（含 options） ===
  const submitOrder = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (!storeId || !UUID_RE.test(storeId)) {
        setErrorMsg(t.invalidStore)
        return
      }
      if (!effectiveTable && !isTakeout) {
        setErrorMsg('桌號遺失，請返回上一頁重新選擇桌號')
        return
      }

      // 後端再次保護：依場景即時查旗標
      if (!isTakeout) {
        const { data: flag, error: flagErr } = await supabase
          .from('store_feature_flags')
          .select('enabled')
          .eq('store_id', storeId)
          .eq('feature_key', 'dine_in')
          .maybeSingle()
        const allowDineIn = flagErr ? dineInEnabled : flag ? !!flag.enabled : true
        if (!allowDineIn) {
          setErrorMsg(t.dineInBlocked)
          return
        }
      } else {
        const { data: flag2, error: flagErr2 } = await supabase
          .from('store_feature_flags')
          .select('enabled')
          .eq('store_id', storeId)
          .eq('feature_key', 'takeout')
          .maybeSingle()
        const allowTakeout = flagErr2 ? takeoutEnabled : flag2 ? !!flag2.enabled : true
        if (!allowTakeout) {
          setErrorMsg(t.takeoutBlocked)
          return
        }
      }

      const lineUserId = getCookie('line_user_id')
      if (isTakeout && !lineUserId) {
        setErrorMsg('❌ 尚未綁定 LINE，請先登入再送單')
        return
      }

      const totalAmount = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0)
      const noteText = isTakeout
        ? `姓名：${customerName} | 電話：${customerPhone}${note ? ` | 備註：${note}` : ''}`
        : note

      const resp = await fetch('/api/orders/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          table_number: effectiveTable || (isTakeout ? 'takeout' : ''),
          items: selectedItems, // 含 options（中文）
          note: noteText,
          status: 'pending',
          total: totalAmount,
          line_user_id: isTakeout ? lineUserId : null,
          spicy_level: spicyLevel || null
        })
      })

      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) {
        console.error('submitOrder API error:', json?.error || json)
        setErrorMsg(`${t.fail}（${json?.error || 'API error'}）`)
        return
      }

      setSuccess(true)
      void fetchOrders()
      setSelectedItems([])
      setNote('')
      setSpicyLevel('')
      setCustomerName('')
      setCustomerPhone('')
      setConfirming(false)
      setErrorMsg('')
    } catch (e: any) {
      console.error('submitOrder exception:', e?.message || e)
      setErrorMsg(`${t.fail}（${e?.message || 'Unexpected error'}）`)
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- Render ----------
  if (invalidStore) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="absolute top-4 right-4 text-sm border px-2 py-1 rounded"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        <h1 className="text-2xl font-bold mb-4">🛍 {t.takeaway}</h1>
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4 shadow">❌ {t.invalidStore}</div>
        <p className="text-sm text-gray-600">
          範例：
          <code className="px-1 py-0.5 bg-gray-100 rounded">
            /order?store=fc4179f2-c89d-4f5d-a6a1-4a04a57a220b&table=takeout
          </code>
        </p>
      </div>
    )
  }

  if (!isLiffReady || !storeId || !flagsLoaded) {
    return <p className="text-red-500 p-4">❗請稍候，頁面初始化中…</p>
  }

  // 內用被封鎖：提供一鍵切換到外帶
  if (!isTakeout && !dineInEnabled) {
    return (
      <div className="p-4 max-w-2xl mx-auto relative">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="absolute top-4 right-4 text-sm border px-2 py-1 rounded"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        <h1 className="text-2xl font-bold mb-4">📝 {t.title}</h1>
        <div className="mb-4 p-3 rounded border border-amber-300 bg-amber-50 text-amber-800">
          {t.dineInBlocked}
        </div>
        <button
          onClick={switchToTakeout}
          className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
        >
          切換為外帶
        </button>
      </div>
    )
  }

  // 外帶被封鎖：顯示封鎖訊息（不提供切換，因為沒有桌號）
  if (isTakeout && !takeoutEnabled) {
    return (
      <div className="p-4 max-w-2xl mx-auto relative">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="absolute top-4 right-4 text-sm border px-2 py-1 rounded"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        <h1 className="text-2xl font-bold mb-4">🛍 {t.takeaway}</h1>
        <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-red-700">
          {t.takeoutBlocked}
        </div>
      </div>
    )
  }

  if (!hasLineCookie) {
    return (
      <div className="p-4 max-w-2xl mx-auto relative">
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="absolute top-4 right-4 text-sm border px-2 py-1 rounded"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        <h1 className="text-2xl font-bold mb-4">{isTakeout ? `🛍 ${t.takeaway}` : `📝 ${t.title}`}</h1>

        <div className="mb-6 text-sm">
          <div className="text-red-600 mb-2">此頁需要先完成 LINE 登入。</div>
          {errorMsg && (
            <div className="mb-2 p-2 rounded border border-red-300 bg-red-50 text-red-700">
              {errorMsg}
              <button
                onClick={() => {
                  const w = safeWindow()
                  if (!w) return
                  const cookieQs = getCookie(COOKIE_QS_KEY)
                  if (cookieQs) {
                    router.replace(`/order${cookieQs}`)
                    delCookie(COOKIE_QS_KEY)
                    return
                  }
                  const cleanUrl = buildCleanRedirectUrl(w, router.query)
                  router.replace(cleanUrl)
                }}
                className="ml-2 underline"
              >
                清除授權參數並重試
              </button>
            </div>
          )}
          <button
            onClick={handleManualLogin}
            disabled={!isLiffReady || loggingIn}
            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            使用 LINE 登入
          </button>
          <p className="text-xs text-gray-500 mt-2">
            若不是在 LINE App 內開啟，登入可能失敗，建議改用 LINE 內建瀏覽器開啟本頁。
          </p>
        </div>
      </div>
    )
  }

  const content = !confirming ? (
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
                {order.created_at
                  ? ` · ${new Date(order.created_at).toLocaleString('zh-TW', {
                      timeZone: 'Asia/Taipei'
                    })}`
                  : ''}
              </h2>
              <ul className="list-disc pl-5 text-sm mb-2">
                {order.items.map((item, i) => (
                  <li key={i} className="mb-1">
                    {item.name} × {item.quantity}（NT$ {item.price * item.quantity}）
                    {renderOptionsList(item.options)}
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

      {categories.map((cat) => (
        <div key={cat.id} className="mb-6">
          <h2 className="text-xl font-semibold mb-2 border-l-4 pl-2 border-yellow-400 text-yellow-700">
            {cat.name}
          </h2>
          <ul className="grid gap-4">
            {menus
              .filter((m) => String(m.category_id) === String(cat.id))
              .map((menu) => (
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
                        {selectedItems.find((i) => i.id === menu.id)?.quantity || 0}
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
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-full border p-2 rounded"
            placeholder={t.phone}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </div>
      )}

      {/* 辣度選擇（選填） */}
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
          onChange={(e) => {
            const v = e.target.value
            if (v.length <= 100) setNote(v)
          }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement
            el.style.height = 'auto'
            el.style.height = el.scrollHeight + 'px'
          }}
        />
        <p className="text-xs text-gray-400 text-right">{note.length}/100</p>
      </div>

      {errorMsg && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4 shadow">❌ {errorMsg}</div>
      )}

      <div className="sticky bottom-4 bg-white pt-4 pb-2">
        <div className="flex justify-between items-center">
          <span className="text-xl font-bold">
            {t.total}：NT$ {total}
          </span>
          <button
            onClick={handleConfirm}
            className="bg-yellow-500 text-white px-6 py-2 rounded"
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </>
  ) : (
    <div className="bg-white border rounded p-4 shadow">
      <h2 className="text-lg font-bold mb-2">{t.confirmTitle}</h2>
      {errorMsg && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-3 shadow">❌ {errorMsg}</div>
      )}
      <ul className="list-disc pl-5 text-sm mb-3">
        {selectedItems.map((item, idx) => (
          <li key={idx} className="mb-1">
            {item.name} × {item.quantity}（NT$ {item.price}）
            {renderOptionsList(item.options)}
          </li>
        ))}
      </ul>
      {spicyLevel && <p className="text-sm text-red-600 mb-1">{t.spicyPreview}：{spicyLevel}</p>}
      {isTakeout && (
        <>
          <p className="text-sm text-gray-700 mb-1">👤 姓名：{customerName}</p>
          <p className="text-sm text-gray-700 mb-1">📞 電話：{customerPhone}</p>
        </>
      )}
      {note && <p className="text-sm text-gray-700 mb-3">📝 備註：{note}</p>}
      <p className="font-bold mb-4">
        {t.total}：NT$ {total}
      </p>
      <div className="flex gap-3">
        <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded border">
          {t.back}
        </button>
        <button
          onClick={submitOrder}
          disabled={submitting}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {submitting ? '送出中…' : t.submit}
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto relative">
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        className="absolute top-4 right-4 text-sm border px-2 py-1 rounded"
      >
        {lang === 'zh' ? 'EN' : '中'}
      </button>

      <h1 className="text-2xl font-bold mb-4">{isTakeout ? `🛍 ${t.takeaway}` : `📝 ${t.title}`}</h1>

      {success && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 shadow">{t.success}</div>}

      {content}

      {/* === 商品選項彈窗 === */}
      {activeMenu && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg font-bold mb-4">{activeMenu.name}</h2>
            <ItemOptionPicker
              groups={optionGroups}
              value={chosenOptions}
              onChange={setChosenOptions}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setActiveMenu(null)}
                className="px-4 py-2 border rounded"
              >
                取消
              </button>
              <button
                onClick={addToCart}
                className="px-4 py-2 bg-green-600 text-white rounded"
              >
                加入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default dynamic(() => Promise.resolve(OrderPage), { ssr: false })
