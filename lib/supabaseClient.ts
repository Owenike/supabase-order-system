// /lib/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 建議：把正確的專案網址與 anon key 放在 .env.*
// 例如：
// NEXT_PUBLIC_SUPABASE_URL=https://oyjrnvahbijrkjeznmeo.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

const RAW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const RAW_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!RAW_URL || !RAW_KEY) {
  throw new Error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 環境變數。')
}

const SUPABASE_URL = RAW_URL.trim()
const SUPABASE_ANON_KEY = RAW_KEY.trim()

// ---- 基本格式驗證（可即時抓到設錯專案網域的情況）----
if (!SUPABASE_URL.startsWith('https://')) {
  throw new Error('❌ NEXT_PUBLIC_SUPABASE_URL 必須以 https:// 開頭')
}
try {
  const u = new URL(SUPABASE_URL)
  if (!u.hostname.endsWith('.supabase.co')) {
    // 不是 Supabase 正式網域，九成是填錯
    // 這裡不用 throw，改用 error + 提示，避免打包時直接炸掉
    // 但仍強烈建議修正成你的專案網域：oyjrnvahbijrkjeznmeo.supabase.co
    // （若你確定使用的是自建 Proxy，則可忽略）
    // eslint-disable-next-line no-console
    console.error(
      `⚠️ NEXT_PUBLIC_SUPABASE_URL（${u.hostname}）看起來不是有效的 Supabase 專案網域。請確認是否應為 oyjrnvahbijrkjeznmeo.supabase.co`
    )
  }
} catch {
  throw new Error('❌ NEXT_PUBLIC_SUPABASE_URL 不是有效的 URL')
}

// ---- Browser 專用的小工具：清除 #access_token 等雜湊片段（更乾淨的網址）----
function cleanupAuthHashOnce() {
  if (typeof window === 'undefined') return
  if (!window.location.hash) return
  const hash = window.location.hash
  // Supabase OAuth/魔法連結常見參數
  if (/#(access_token|type=recovery|provider_token|refresh_token)=/i.test(hash)) {
    const url = new URL(window.location.href)
    url.hash = ''
    // 不要新增歷史紀錄
    window.history.replaceState({}, document.title, url.toString())
  }
}

// ---- Singleton：避免 Fast Refresh 產生多個 client ----
declare global {
  // eslint-disable-next-line no-var
  var __SUPABASE_CLIENT__: SupabaseClient | undefined
}

let _client: SupabaseClient | undefined = globalThis.__SUPABASE_CLIENT__

if (!_client) {
  cleanupAuthHashOnce()
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 行動裝置 / 信箱驗證回跳常帶 #access_token，需開啟
      detectSessionInUrl: true,
    },
    // 可選：自訂 headers，方便在 Logs 追蹤來源
    global: {
      headers: { 'x-client-info': 'olinex-web' },
    },
  })
  globalThis.__SUPABASE_CLIENT__ = _client
}

// 對外輸出單一實例
export const supabase = _client
