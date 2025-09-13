// /pages/order/index.tsx
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
interface OrderRecord {
  items: { id?: string; name: string; quantity: number; price: number }[]
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
    dineInBlocked: '本店目前已暫停「內用」，僅提供外帶服務。你可以改為外帶繼續下單。'
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
    spicyLabel: 'Spicy Level (optional)',
    spicyNone: '(None)',
    spicyNo: 'Mild / None',
    spicyLight: 'Light',
    spicyMedium: 'Medium',
    spicyHot: 'Hot',
    spicyPreview: '🌶️ Spicy',
    invalidStore: 'Invalid store ID. Please ensure the "store" query param is a valid UUID.',
    dineInBlocked: 'Dine-in is currently unavailable. Please switch to takeout to continue.'
  }
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
    { id: string; name: string; price: number; quantity: number }[]
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

  // === 新增：商品選項相關狀態 ===
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([])
  const [chosenOptions, setChosenOptions] = useState<Record<string, string | string[]>>({})
  const [activeMenu, setActiveMenu] = useState<MenuItem | null>(null)

  // 內用旗標
  const [dineInEnabled, setDineInEnabled] = useState<boolean>(true)
  const [flagLoaded, setFlagLoaded] = useState<boolean>(false)

  const t = langMap[lang]
  const total = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [selectedItems]
  )

  // 取得 LINE user cookie（優先 ID Token 的 sub，再補 profile）
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

  // ---------- 初始化 LIFF（內用/外帶都需要登入） ----------
  useEffect(() => {
    const w = safeWindow()
    if (!w || !routerReady) return
    let disposed = false

    ;(async () => {
      try {
        // 允許 debug 跳過 LIFF
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
            console.log('[LIFF] logged-in & has code/state → clean URL to', cleanUrl)
            router.replace(cleanUrl)
          }
          if (!disposed) setIsLiffReady(true)
          return
        }

        // 未登入：保留參數還原能力，先清 code/state
        if (hasAuthParams) {
          const cleanUrl = buildCleanRedirectUrl(w, router.query)
          console.log('[LIFF] not-logged & has code/state → clean URL to', cleanUrl)
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
        console.log('[LIFF] restore via cookie', cookieQs)
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
            console.log('[LIFF] restore via liffRedirectUri', decoded)
            router.replace(`/order?store=${encodeURIComponent(s)}&table=${encodeURIComponent(t2)}`)
            setQsRestored(true)
            return
          }
        } catch (e) {
          console.warn('parse liffRedirectUri failed', e)
        }
      }

      const savedQs = w.sessionStorage.getItem(SAVED_QS_KEY) || ''
      if (savedQs) {
        const parsed = parseQS(savedQs)
        const s = parsed.store || FALLBACK_STORE_ID
        const t2 = parsed.table || FALLBACK_TABLE
        console.log('[LIFF] restore via session/local/fallback', s, t2)
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

  // ---------- 監聽 query 變化，寫入 storeId（含 UUID 防呆） ----------
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

  // ---------- 讀取「內用是否開放」旗標 ----------
  const fetchDineInFlag = useCallback(
    async (sid: string) => {
      if (!UUID_RE.test(sid)) {
        setDineInEnabled(true)
        setFlagLoaded(true)
        return
      }
      const { data, error } = await supabase
        .from('store_feature_flags')
        .select('enabled')
        .eq('store_id', sid)
        .eq('feature_key', 'dine_in')
        .maybeSingle()
      if (error) {
        console.warn('fetchDineInFlag error:', error.message)
        setDineInEnabled(true) // 無法讀取時，先視為可內用（可改為 false 取保守策略）
      } else {
        setDineInEnabled(data ? !!data.enabled : true) // 沒旗標視為啟用
      }
      setFlagLoaded(true)
    },
    [setDineInEnabled, setFlagLoaded]
  )

  // ---------- 資料載入 ----------
  // ✅ 修正：只顯示「未完成」的訂單（completed / canceled 都不顯示）
  const fetchOrders = useCallback(async () => {
    if (!storeId || !UUID_RE.test(storeId)) return
    const lineUserId = getCookie('line_user_id')

    // 查詢時間窗（近 60 天）
    const SINCE_DAYS = 60
    const sinceIso = new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    let q = supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .gte('created_at', sinceIso)
      .not('status', 'in', '("completed","canceled")') // ✅ 關鍵：只拿未完成
      .order('created_at', { ascending: false })

    if (isTakeout) {
      // 外帶：依 line_user_id
      if (!lineUserId) {
        setOrderHistory([])
        return
      }
      q = q.eq('line_user_id', lineUserId).limit(20)
    } else {
      // 內用：依桌號
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

  // 旗標 + LIFF + 資料載入
  useEffect(() => {
    if (!storeId || !UUID_RE.test(storeId)) return
    ;(async () => {
      await fetchDineInFlag(storeId)
    })()
  }, [storeId, fetchDineInFlag])

  useEffect(() => {
    if (!isLiffReady || !storeId || !UUID_RE.test(storeId) || !flagLoaded) return
    ;(async () => {
      if (liffRef?.isLoggedIn?.() && !getCookie('line_user_id')) {
        await ensureLineCookie()
      }
      await fetchMenus(storeId)
      await fetchCategories(storeId)
      await fetchOrders()
    })()
  }, [isLiffReady, storeId, fetchOrders, ensureLineCookie, liffRef, flagLoaded])

  // ---------- 缺 cookie 上報（非必要，可保留除錯） ----------
  useEffect(() => {
    if (!isLiffReady) return
    const lineUserId = getCookie('line_user_id')
    const storeParam = typeof router.query.store === 'string' ? router.query.store : 'unknown'
    if (isTakeout && !lineUserId) {
      void supabase.from('login_logs').insert({
        line_user_id: 'MISSING',
        error_message: 'line_user_id not found in cookie',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        store_id: UUID_RE.test(storeParam) ? storeParam : null
      })
    }
  }, [router.query, isLiffReady, isTakeout])

  // ---------- UI 事件 ----------
  // === 修改：點擊菜單 → 先讀取商品選項（有選項就跳出彈窗；沒選項直接加入） ===
  const toggleItem = async (menu: MenuItem) => {
    try {
      const groups = await fetchItemOptions(menu.id)
      // 若 groups 為空，走原本「直接 +1」邏輯
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
      // 有選項：開啟彈窗
      setOptionGroups(groups)
      setChosenOptions({})
      setActiveMenu(menu)
    } catch (e) {
      console.error('fetchItemOptions error:', e)
      // fallback：若讀取失敗，仍允許直接加入
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

  // 新增：在彈窗中按「加入」後，把選項加價計入單價並加入購物車
  const addToCart = () => {
    if (!activeMenu) return
    // 必填檢查
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
    setSelectedItems((prev) => [
      ...prev,
      { id: activeMenu.id, name: activeMenu.name, price: finalPrice, quantity: 1 }
    ])
    setActiveMenu(null)
  }

  const handleConfirm = () => {
    if (selectedItems.length === 0) return setErrorMsg(t.errorNoItem)
    if (isTakeout) {
      if (!customerName.trim()) return setErrorMsg(t.errorName)
      if (!/^09\d{8}$/.test(customerPhone.trim())) return setErrorMsg(t.errorPhone)
    }
    // 內用被封鎖禁止進入確認
    if (!isTakeout && flagLoaded && !dineInEnabled) {
      setErrorMsg(t.dineInBlocked)
      return
    }
    setErrorMsg('')
    setConfirming(true)
  }

  // 切換為外帶（用於被封鎖時）
  const switchToTakeout = () => {
    const q = new URLSearchParams(router.asPath.split('?')[1] || '')
    q.set('table', 'takeout')
    if (storeId) q.set('store', storeId)
    router.replace(`/order?${q.toString()}`)
  }

  // 只在使用者按下按鈕時才觸發登入（回跳到 /line-success）
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

      // 一次性許可：只有按鈕觸發時才允許 liff.login()
      try {
        w.sessionStorage.setItem('ALLOW_LIFF_LOGIN', '1')
      } catch {}

      // 登入回跳 → /line-success（由該頁清參數後再回 /order）
      const successUrl = buildSuccessRedirectUrl(w, router.query)

      // 若當前已帶 code/state，先導去 /line-success
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

  // === 已改為呼叫 /api/orders/create（移除 display_name） ===
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

      // 內用封鎖保護（維持你的原邏輯；送單前再次確認）
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
          items: selectedItems,
          note: noteText,
          status: 'pending',
          total: totalAmount,
          line_user_id: isTakeout ? lineUserId : null,
          spicy_level: spicyLevel || null
          // display_name: 已移除，避免 500（schema 無此欄位）
        })
      })

      const json = await resp.json().catch(() => ({} as any))
      if (!resp.ok) {
        console.error('submitOrder API error:', json?.error || json)
        setErrorMsg(`${t.fail}（${json?.error || 'API error'}）`)
        return
      }

      // 成功：清空，刷新
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

  // ---------- Render：若未登入 LINE（無 cookie），先顯示登入卡片並阻擋內容 ----------
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

  if (!isLiffReady || !storeId || !flagLoaded) {
    return <p className="text-red-500 p-4">❗請稍候，頁面初始化中…</p>
  }

  // 內用被封鎖且目前不是外帶：阻擋 + 提供「切換為外帶」
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

  // 內用/外帶統一登入門檻：沒有 line_user_id 就先顯示登入卡片
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
                  <li key={i}>
                    {item.name} × {item.quantity}（NT$ {item.price * item.quantity}）
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
          <li key={idx}>
            {item.name} × {item.quantity}（NT$ {item.price}）
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

  // 清除授權參數（保留 store/table）
  const clearAuthParams = () => {
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
  }

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
