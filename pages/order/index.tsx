/* eslint-disable no-console */
'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import { getLiff } from '@/lib/liffClient'
import { fetchItemOptions, type OptionGroup } from '@/utils/fetchItemOptions'
import ItemOptionPicker from '@/components/ItemOptionPicker'
import { Button } from '@/components/ui/button'

// ---------- 常數與工具 ----------
const SAVED_QS_KEY = 'order_return_qs'
const SAVED_STORE_KEY = 'order_store'
const SAVED_TABLE_KEY = 'order_table'
const REDIRECT_URI_BASE = 'https://www.olinex.app/order' // 清參數時用
const COOKIE_QS_KEY = 'order_qs_backup'
const FLAG_RETURNED = 'liff_returned_once'
const COOKIE_DOMAIN = '.olinex.app'

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

function buildCleanRedirectUrl(w: Window, q: Record<string, any>) {
  const { store, table, src } = resolveTarget(w, q)
  const sp = new URLSearchParams()
  if (store) sp.set('store', store)
  if (table) sp.set('table', table)
  const url = sp.toString() ? `${REDIRECT_URI_BASE}?${sp.toString()}` : REDIRECT_URI_BASE
  console.log('[LIFF] buildCleanRedirectUrl ->', url, 'sources=', src)
  return url
}

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
interface Category { id: string; name: string }
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

// ---------- 舊資料鍵值中文化 ----------
function translateOptionPair(key: string, value: string | string[]): { k: string; v: string } {
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
function renderOptionsList(opts?: OptionsMap | null) {
  if (!opts || typeof opts !== 'object') return null
  const entries = Object.entries(opts)
  if (!entries.length) return null
  return (
    <ul className="ml-4 text-sm text-gray-600 list-disc">
      {entries.map(([rawK, rawV]) => {
        const { k, v } = translateOptionPair(rawK, rawV)
        return <li key={rawK}>{k}：{v}</li>
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
          try { w.sessionStorage.setItem(FLAG_RETURNED, '1') } catch {}
        }

        const liff = await getLiff()
        setLiffRef(liff)
        try { await (liff as any).ready } catch {}

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

    return () => { disposed = true }
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

  // ---------- 讀取「內用/外帶 是否開放」旗標 ----------
  const fetchFeatureFlags = useCallback(
    async (sid: string) => {
      try {
        if (!UUID_RE.test(sid)) {
          setDineInEnabled(true)
          setTakeoutEnabled(true)
          setFlagsLoaded(true)
          return
        }
        const resp = await fetch('/api/public/get-flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: sid }),
        })
        const json = await resp.json().catch(() => ({} as any))
        if (resp.ok) {
          setDineInEnabled(json?.dine_in ?? true)
          setTakeoutEnabled(json?.takeout ?? true)
        } else {
          setDineInEnabled(true); setTakeoutEnabled(true)
        }
      } catch {
        setDineInEnabled(true); setTakeoutEnabled(true)
      } finally { setFlagsLoaded(true) }
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
    if (error) return console.error('fetchMenus error:', error.message)
    if (data) setMenus(data as unknown as MenuItem[])
  }

  const fetchCategories = async (sid: string) => {
    if (!UUID_RE.test(sid)) return
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('store_id', sid)
      .order('created_at', { ascending: true })
    if (error) return console.error('fetchCategories error:', error.message)
    if (data) setCategories(data as unknown as Category[])
  }

  useEffect(() => {
    if (!storeId || !UUID_RE.test(storeId)) return
    ;(async () => { await fetchFeatureFlags(storeId) })()
  }, [storeId, fetchFeatureFlags])

  useEffect(() => {
    if (!isLiffReady || !storeId || !UUID_RE.test(storeId) || !flagsLoaded) return
    ;(async () => {
      if (liffRef?.isLoggedIn?.() && !getCookie('line_user_id')) await ensureLineCookie()
      await fetchMenus(storeId)
      await fetchCategories(storeId)
      await fetchOrders()
    })()
  }, [isLiffReady, storeId, fetchOrders, ensureLineCookie, liffRef, flagsLoaded])

  // ---------- UI 行為 ----------
  const toggleItem = async (menu: MenuItem) => {
    try {
      const groups = await fetchItemOptions(menu.id)
      if (!groups || groups.length === 0) {
        const exists = selectedItems.find((i) => i.id === menu.id)
        if (exists) {
          setSelectedItems(selectedItems.map((i) => (i.id === menu.id ? { ...i, quantity: i.quantity + 1 } : i)))
        } else {
          setSelectedItems((prev) => [...prev, { id: menu.id, name: menu.name, price: menu.price, quantity: 1 }])
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
        setSelectedItems(selectedItems.map((i) => (i.id === menu.id ? { ...i, quantity: i.quantity + 1 } : i)))
      } else {
        setSelectedItems((prev) => [...prev, { id: menu.id, name: menu.name, price: menu.price, quantity: 1 }])
      }
    }
  }

  const reduceItem = (id: string) => {
    setSelectedItems(selectedItems.map((i) => (i.id === id ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0))
  }

  const addToCart = () => {
    if (!activeMenu) return
    const missing = optionGroups.find((g) => g.required && !chosenOptions[g.id])
    if (missing) {
      alert(`請選擇 ${missing.name}`); return
    }

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

    const displayOptions: OptionsMap = {}
    optionGroups.forEach((g) => {
      const val = chosenOptions[g.id]
      if (!val) return
      if (g.input_type === 'single') {
        const found = g.values.find((x) => x.value === val)
        const label = (found?.label ?? found?.value ?? '').toString().trim()
        if (label) displayOptions[g.name] = label
      } else {
        const labels = (val as string[]).map((vv) => {
          const f = g.values.find((x) => x.value === vv)
          return (f?.label ?? f?.value ?? '').toString().trim()
        }).filter(Boolean)
        if (labels.length) displayOptions[g.name] = labels
      }
    })

    setSelectedItems((prev) => [...prev, { id: activeMenu.id, name: activeMenu.name, price: finalPrice, quantity: 1, ...(Object.keys(displayOptions).length ? { options: displayOptions } : {}) }])
    setActiveMenu(null)
  }

  const handleConfirm = () => {
    if (selectedItems.length === 0) return setErrorMsg(t.errorNoItem)
    if (isTakeout) {
      if (!takeoutEnabled && flagsLoaded) { setErrorMsg(t.takeoutBlocked); return }
      if (!customerName.trim()) return setErrorMsg(t.errorName)
      if (!/^09\d{8}$/.test(customerPhone.trim())) return setErrorMsg(t.errorPhone)
    } else {
      if (flagsLoaded && !dineInEnabled) { setErrorMsg(t.dineInBlocked); return }
    }
    setErrorMsg(''); setConfirming(true)
  }

  const switchToTakeout = () => {
    const q = new URLSearchParams(router.asPath.split('?')[1] || '')
    q.set('table', 'takeout'); if (storeId) q.set('store', storeId)
    router.replace(`/order?${q.toString()}`)
  }

  const handleManualLogin = async () => {
    const w = safeWindow(); if (!w || loggingIn) return
    setLoggingIn(true)
    try {
      let liff = liffRef
      if (!liff) { liff = await getLiff(); setLiffRef(liff); try { await (liff as any).ready } catch {} }
      if (liff?.isLoggedIn?.()) { await ensureLineCookie(); await fetchOrders(); return }

      try { w.sessionStorage.setItem('ALLOW_LIFF_LOGIN', '1') } catch {}
      const successUrl = buildSuccessRedirectUrl(w, router.query)
      const sp = new URLSearchParams(w.location.search || '')
      if (sp.get('code') || sp.get('state')) {
        await router.replace(successUrl)
        setTimeout(() => { (liff as any)?.login?.({ redirectUri: successUrl, botPrompt: 'aggressive' }) }, 60)
        return
      }
      await (liff as any).login({ redirectUri: successUrl, botPrompt: 'aggressive' })
    } catch (err: any) {
      console.error('[LIFF] Manual login failed:', err?.message || err)
      setErrorMsg('LINE 登入失敗，請關閉分頁重開或改用 LINE 內建瀏覽器再試')
    } finally { setLoggingIn(false) }
  }

  const submitOrder = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (!storeId || !UUID_RE.test(storeId)) { setErrorMsg(t.invalidStore); return }
      if (!effectiveTable && !isTakeout) { setErrorMsg('桌號遺失，請返回上一頁重新選擇桌號'); return }

      try {
        const resp = await fetch('/api/public/get-flags', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store_id: storeId }),
        })
        const json = await resp.json().catch(() => ({} as any))
        if (resp.ok) {
          const latestDineIn = json?.dine_in ?? true
          const latestTakeout = json?.takeout ?? true
          if (!isTakeout && !latestDineIn) { setErrorMsg(t.dineInBlocked); return }
          if (isTakeout && !latestTakeout) { setErrorMsg(t.takeoutBlocked); return }
        }
      } catch {}

      const lineUserId = getCookie('line_user_id')
      if (isTakeout && !lineUserId) { setErrorMsg('❌ 尚未綁定 LINE，請先登入再送單'); return }

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
          items: selectedItems,
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
        setErrorMsg(`${t.fail}（${json?.error || 'API error'}）`); return
      }

      setSuccess(true)
      void fetchOrders()
      setSelectedItems([]); setNote(''); setSpicyLevel(''); setCustomerName(''); setCustomerPhone('')
      setConfirming(false); setErrorMsg('')
    } catch (e: any) {
      console.error('submitOrder exception:', e?.message || e)
      setErrorMsg(`${t.fail}（${e?.message || 'Unexpected error'}）`)
    } finally { setSubmitting(false) }
  }

  // ---------- Render ----------
  if (invalidStore) {
    return (
      <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-3xl mx-auto">
        <div className="flex items-start justify-between pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 text-2xl">🛍</div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{t.takeaway}</h1>
              <p className="text-white/70 text-sm mt-1">請確認網址參數是否正確</p>
            </div>
          </div>
          <Button variant="soft" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? 'EN' : '中'}
          </Button>
        </div>

        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
          <div className="text-red-300">❌ {t.invalidStore}</div>
          <p className="text-sm text-white/70 mt-2">
            範例：
            <code className="px-1 py-0.5 bg-white/10 rounded ml-1">/order?store=...&table=takeout</code>
          </p>
        </div>
      </div>
    )
  }

  if (!isLiffReady || !storeId || !flagsLoaded) {
    return <p className="text-white/80 p-6">❗請稍候，頁面初始化中…</p>
  }

  if (!isTakeout && !dineInEnabled) {
    return (
      <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-3xl mx-auto">
        <div className="flex items-start justify-between pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 text-2xl">📝</div>
            <div><h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{t.title}</h1></div>
          </div>
          <Button variant="soft" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang === 'zh' ? 'EN' : '中'}</Button>
        </div>

        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
          <div className="mb-4 p-3 rounded border border-amber-300/30 bg-amber-500/15 text-amber-200">
            {t.dineInBlocked}
          </div>
          <Button variant="success" onClick={switchToTakeout}>切換為外帶</Button>
        </div>
      </div>
    )
  }

  if (isTakeout && !takeoutEnabled) {
    return (
      <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-3xl mx-auto">
        <div className="flex items-start justify-between pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 text-2xl">🛍</div>
            <div><h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{t.takeaway}</h1></div>
          </div>
          <Button variant="soft" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang === 'zh' ? 'EN' : '中'}</Button>
        </div>

        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
          <div className="mb-4 p-3 rounded border border-red-300/30 bg-red-500/15 text-red-200">
            {t.takeoutBlocked}
          </div>
        </div>
      </div>
    )
  }

  if (!hasLineCookie) {
    return (
      <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-3xl mx-auto">
        <div className="flex items-start justify-between pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 text-2xl">{isTakeout ? '🛍' : '📝'}</div>
            <div><h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{isTakeout ? t.takeaway : t.title}</h1></div>
          </div>
          <Button variant="soft" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang === 'zh' ? 'EN' : '中'}</Button>
        </div>

        <div className="bg-[#2B2B2B] text-white rounded-lg shadow border border-white/10 p-4">
          <div className="text-red-200 mb-2">此頁需要先完成 LINE 登入。</div>
          {errorMsg && (
            <div className="mb-2 p-2 rounded border border-red-300/30 bg-red-500/15 text-red-200">
              {errorMsg}
              <button
                onClick={() => {
                  const w = safeWindow(); if (!w) return
                  const cookieQs = getCookie(COOKIE_QS_KEY)
                  if (cookieQs) { router.replace(`/order${cookieQs}`); delCookie(COOKIE_QS_KEY); return }
                  const cleanUrl = buildCleanRedirectUrl(w, router.query); router.replace(cleanUrl)
                }}
                className="ml-2 underline"
              >
                清除授權參數並重試
              </button>
            </div>
          )}
          <Button variant="success" onClick={handleManualLogin} disabled={!isLiffReady || loggingIn}>
            使用 LINE 登入
          </Button>
          <p className="text-xs text-white/60 mt-2">
            若不是在 LINE App 內開啟，登入可能失敗，建議改用 LINE 內建瀏覽器開啟本頁。
          </p>
        </div>
      </div>
    )
  }

  const content = !confirming ? (
    <>
      {/* 歷史訂單 */}
      {orderHistory.length > 0 && (
        <Button
          onClick={() => setShowPrevious(!showPrevious)}
          variant="soft"
          className="mb-4"
        >
          📋 {t.viewLast}
        </Button>
      )}

      {showPrevious && (
        <div className="mb-6 space-y-4">
          {orderHistory.map((order, idx) => (
            <div key={idx} className="bg-white rounded-lg border shadow p-4">
              <h2 className="font-semibold mb-2">
                {t.confirmTitle}（第 {idx + 1} 筆）
                {order.created_at
                  ? ` · ${new Date(order.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
                  : ''}
              </h2>
              <ul className="list-disc pl-5 text-sm mb-2">
                {order.items.map((item, i) => (
                  <li key={i} className="mb-1">
                    {item.name} × {item.quantity}（NT$ {Number(item.price || 0) * Number(item.quantity || 0)}）
                    {renderOptionsList(item.options)}
                  </li>
                ))}
              </ul>
              {order.spicy_level && <p className="text-sm text-red-600 mb-1">{t.spicyPreview}：{order.spicy_level}</p>}
              {order.note && <p className="text-sm text-gray-700 mb-2">📝 {order.note}</p>}
              <p className="font-bold">總計：NT$ {order.total}</p>
            </div>
          ))}
        </div>
      )}

      {/* 分類與菜單 */}
      {categories.map((cat) => (
        <div key={cat.id} className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-white">{cat.name}</h2>
          <ul className="grid gap-4">
            {menus
              .filter((m) => String(m.category_id) === String(cat.id))
              .map((menu) => (
                <li key={menu.id} className="bg-white text-gray-900 rounded-lg border shadow p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-lg mb-1">{menu.name}</div>
                      <div className="text-sm text-gray-600">NT$ {menu.price}</div>
                      {menu.description && <div className="text-xs text-gray-400 mt-1">{menu.description}</div>}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Button size="sm" variant="destructive" onClick={() => reduceItem(menu.id)}>－</Button>
                      <span className="min-w-[20px] text-center">
                        {selectedItems.find((i) => i.id === menu.id)?.quantity || 0}
                      </span>
                      <Button size="sm" variant="success" onClick={() => toggleItem(menu)}>＋</Button>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}

      {/* 外帶表單 */}
      {isTakeout && (
        <div className="bg-white rounded-lg border shadow p-4 mb-6 space-y-2">
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

      {/* 辣度選擇 */}
      <div className="bg-white rounded-lg border shadow p-4 mb-6">
        <label className="block text-sm text-gray-700 mb-1">{t.spicyLabel}</label>
        <select className="w-full border p-2 rounded" value={spicyLevel} onChange={(e) => setSpicyLevel(e.target.value)}>
          <option value="">{t.spicyNone}</option>
          <option value={lang === 'zh' ? '不辣' : 'Mild / None'}>{t.spicyNo}</option>
          <option value={lang === 'zh' ? '小辣' : 'Light'}>{t.spicyLight}</option>
          <option value={lang === 'zh' ? '中辣' : 'Medium'}>{t.spicyMedium}</option>
          <option value={lang === 'zh' ? '大辣' : 'Hot'}>{t.spicyHot}</option>
        </select>
      </div>

      {/* 備註 */}
      <div className="bg-white rounded-lg border shadow p-4 mb-24">
        <h2 className="font-semibold mb-2">{t.noteLabel}</h2>
        <textarea
          className="w-full border p-2 rounded"
          rows={1}
          placeholder={t.notePlaceholder}
          value={note}
          onChange={(e) => {
            const v = e.target.value; if (v.length <= 100) setNote(v)
          }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement
            el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'
          }}
        />
        <p className="text-xs text-gray-400 text-right">{note.length}/100</p>
      </div>

      {/* 底部固定結帳列（深色、全寬固定） */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#2B2B2B] text-white border-t border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-lg font-bold">
            {t.total}：NT$ {total}
          </span>
          <Button variant="warning" onClick={handleConfirm}>
            {t.confirm}
          </Button>
        </div>
      </div>
    </>
  ) : (
    // 確認頁（白底卡）
    <div className="bg-white rounded-lg border shadow p-4">
      <h2 className="text-lg font-bold mb-2">{t.confirmTitle}</h2>
      {errorMsg && <div className="bg-red-100 text-red-700 p-3 rounded mb-3 shadow">❌ {errorMsg}</div>}
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
        <Button variant="secondary" onClick={() => setConfirming(false)}>
          {t.back}
        </Button>
        <Button variant="default" onClick={submitOrder} disabled={submitting}>
          {submitting ? '送出中…' : t.submit}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-28 max-w-3xl mx-auto">
      {/* 頁首：深色一致 */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">{isTakeout ? '🛍' : '📝'}</div>
          <div><h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{isTakeout ? t.takeaway : t.title}</h1></div>
        </div>
        <Button variant="soft" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          {lang === 'zh' ? 'EN' : '中'}
        </Button>
      </div>

      {success && (
        <div className="bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 p-3 rounded mb-4">
          {t.success}
        </div>
      )}

      {content}

      {/* === 商品選項彈窗（深色卡） === */}
      {activeMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#2B2B2B] text-white rounded-lg border border-white/10 p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg font-bold mb-4">{activeMenu.name}</h2>
            <ItemOptionPicker groups={optionGroups} value={chosenOptions} onChange={setChosenOptions} />
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setActiveMenu(null)}>取消</Button>
              <Button variant="success" onClick={addToCart}>加入</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default dynamic(() => Promise.resolve(OrderPage), { ssr: false })
