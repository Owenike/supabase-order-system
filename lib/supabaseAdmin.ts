// /lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js'

// ✅ 一律用「私有」變數；若你還沒設 SUPABASE_URL，就先暫時回退到 NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL || // fallback（建議儘快改成只用 SUPABASE_URL）
  ''

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '' // 務必為 service_role

// 🚫 保護：若不小心在瀏覽器端載入，立即中止（避免 service key 被 bundle）
if (typeof window !== 'undefined') {
  throw new Error('supabaseAdmin can only be imported on the server.')
}

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL as fallback)')
if (!SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

// ✅ Server 專用 client：不持久化、不自動刷新（反正都在單次請求生命週期內）
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
})
