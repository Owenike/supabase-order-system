// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

// ✅ 從 .env 讀取公開金鑰與 URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ❗ 安全防呆：如果變數遺失會主動拋錯（避免打到錯誤專案）
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase 環境變數未設定：請確認 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 是否都已正確配置（且指向有設定 SMTP 的專案）。'
  )
}

// ✅ 建立 supabase client 實例（開啟持久化與自動刷新 + URL 偵測）
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
