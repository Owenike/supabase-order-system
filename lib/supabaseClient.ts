// /lib/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * ✅ 你這個專案「正確」的 Supabase 設定（作為安全回退值）
 *    —— 環境變數有錯時，自動用這組，確保不會再打到 cdzgif... 那個錯誤網域。
 */
const EXPECTED_HOST = 'oyjrnvahbijrkjeznmeo.supabase.co'
const EXPECTED_URL = `https://${EXPECTED_HOST}`
const EXPECTED_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95anJudmFoYmlqcmtqZXpubWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1OTc0MjUsImV4cCI6MjA2MTE3MzQyNX0.eevz9KelzdMJxi2Ka7NvLNp_iv5UESbSqAOWdCUgCcg'

/**
 * 讀取環境變數，並做完整防呆＋自動矯正。
 */
function resolveSupabaseConfig() {
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const rawKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

  let url = rawUrl
  let key = rawKey

  // --- URL 基本檢查 ---
  let host = ''
  try {
    if (!url.startsWith('https://')) throw new Error('URL 必須以 https:// 開頭')
    const u = new URL(url)
    host = u.hostname
    if (!host.endsWith('.supabase.co')) {
      console.error(
        `⚠️ NEXT_PUBLIC_SUPABASE_URL（${host}）看起來不是有效的 Supabase 專案網域。將使用預期專案：${EXPECTED_HOST}`
      )
      url = EXPECTED_URL
      host = EXPECTED_HOST
    }
  } catch (e) {
    console.error(
      `⚠️ NEXT_PUBLIC_SUPABASE_URL 無效或未設定：${rawUrl || '(空)'}。將使用預期專案：${EXPECTED_HOST}`,
      e
    )
    url = EXPECTED_URL
    host = EXPECTED_HOST
  }

  // --- 若 host 不是預期專案，就強制糾正（避免打到錯專案，例如 cdzgif...） ---
  if (host !== EXPECTED_HOST) {
    console.warn(
      `🚨 偵測到你目前的 Supabase 專案主機是「${host}」，與預期「${EXPECTED_HOST}」不同。為避免 400/401/403 問題，已自動改用 ${EXPECTED_URL}。請儘快修正環境變數。`
    )
    url = EXPECTED_URL
  }

  // --- Key 檢查：空值或明顯錯誤時回退 ---
  if (!key || key.length < 40) {
    console.warn('⚠️ NEXT_PUBLIC_SUPABASE_ANON_KEY 缺失或看起來不正確，已使用預期 anon key（請儘快修正環境變數）。')
    key = EXPECTED_ANON_KEY
  }

  return { url, key }
}

const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = resolveSupabaseConfig()

/**
 * Browser 專用：清除 #access_token 等雜湊（魔法登入/密碼重設回跳常見）讓網址更乾淨
 */
function cleanupAuthHashOnce() {
  if (typeof window === 'undefined') return
  if (!window.location.hash) return
  if (/#(access_token|type=recovery|provider_token|refresh_token)=/i.test(window.location.hash)) {
    const url = new URL(window.location.href)
    url.hash = ''
    window.history.replaceState({}, document.title, url.toString())
  }
}

/**
 * Singleton：避免 Fast Refresh / 多次 import 產生多個 client
 */
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
      detectSessionInUrl: true,
    },
    global: {
      headers: { 'x-client-info': 'olinex-web' },
    },
  })
  globalThis.__SUPABASE_CLIENT__ = _client

  // 顯示目前實際使用的設定，方便你在 DevTools 立即確認是否命中預期專案
  // （只印一次，不會在每次 import 都噴 log）
  // eslint-disable-next-line no-console
  console.info('✅ Supabase client initialized', {
    url: SUPABASE_URL,
    projectHost: new URL(SUPABASE_URL).hostname,
  })
}

export const supabase = _client!
