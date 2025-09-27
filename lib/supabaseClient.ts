// /lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 環境變數。')
}

// 確保類型已被窄化為 string，避免嚴格 TS 設定下的提示
export const supabase = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // 行動郵件常用 #access_token 回跳，必須開啟，讓 SDK 自動解析
    detectSessionInUrl: true,
  },
})
