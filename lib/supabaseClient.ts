// /lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // 嚴格模式：缺變數就直接 throw，避免你在正式環境踩到空值
  throw new Error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 環境變數。')
}

/**
 * 前端用的 Supabase Client
 * - persistSession: 保留使用者登入
 * - autoRefreshToken: 自動刷新
 * - detectSessionInUrl: 交給 /auth/callback 手動處理（避免與手動 exchange 重複）
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
