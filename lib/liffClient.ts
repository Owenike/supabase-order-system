// /lib/liffClient.ts
/* eslint-disable no-console */
import type { Liff } from '@line/liff'

let initPromise: Promise<Liff> | null = null

export async function getLiff(): Promise<Liff> {
  if (typeof window === 'undefined') {
    throw new Error('LIFF must run in browser')
  }
  if (!initPromise) {
    initPromise = (async () => {
      const { default: liff } = await import('@line/liff')
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2007831464-7LDjNnmD'
      await liff.init({
        liffId,
        // 外部瀏覽器必須為 true，否則 isLoggedIn() 可能永遠 false
        withLoginOnExternalBrowser: true,
      })

      // 兼容某些版本的 liff.ready（有就等待）
      try {
        const anyLiff: any = liff as any
        if (anyLiff.ready && typeof anyLiff.ready.then === 'function') {
          await anyLiff.ready
        }
      } catch (e) {
        console.warn('[LIFF] ready wait failed (ignored):', e)
      }

      // --- 追蹤與攔截任何未授權的 liff.login() 呼叫 ---
      try {
        const traceOn = new URL(window.location.href).searchParams.get('__trace_login') === '1'
        const anyLiff: any = liff as any
        if (anyLiff && typeof anyLiff.login === 'function' && !anyLiff.__loginPatched) {
          const originalLogin = anyLiff.login.bind(anyLiff)
          anyLiff.__loginPatched = true
          anyLiff.login = (opts?: any) => {
            let allowed = false
            try { allowed = sessionStorage.getItem('ALLOW_LIFF_LOGIN') === '1' } catch {}
            if (traceOn) {
              // 將所有呼叫來源印在 Console，方便定位
              // eslint-disable-next-line no-console
              console.warn('[TRACE] liff.login called. allowed=', allowed, 'opts=', opts, '\nSTACK:\n', new Error().stack)
            }
            if (!allowed) {
              // 阻擋非使用者按鈕觸發的自動登入
              if (traceOn) {
                // eslint-disable-next-line no-alert
                alert('已攔截一個非授權的 liff.login() 呼叫，請開 Console 檢視堆疊來源。')
              }
              return
            }
            // 一次性許可，用過即清
            try { sessionStorage.removeItem('ALLOW_LIFF_LOGIN') } catch {}
            return originalLogin(opts)
          }
        }
      } catch {}

      return liff
    })()
  }
  return initPromise
}

// 選用：需要時可手動重置 LIFF（例如 HMR 或切帳）
export function resetLiff() {
  initPromise = null
}
