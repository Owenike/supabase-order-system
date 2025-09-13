// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

// ✅ 從 .env.local 讀取公開金鑰與 URL（建議寫法）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ❗ 安全防呆：如果變數遺失會主動拋錯
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('❌ Supabase 環境變數未設定，請確認 .env.local 是否正確配置。')
}

// ✅ 建立 supabase client 實例（開啟持久化與自動刷新）
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,       // 將 session 存在 localStorage
    autoRefreshToken: true,     // 自動刷新 token
    detectSessionInUrl: true,   // 支援 OAuth/魔法連結回跳
  },
})
