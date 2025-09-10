// /pages/debug/liff.tsx
import { useEffect, useState } from 'react'

export default function LiffDebug() {
  const [logs, setLogs] = useState<string[]>([])
  const [status, setStatus] = useState<any>({})
  const [envId, setEnvId] = useState<string | undefined>(undefined)

  function log(s: string) {
    setLogs((prev) => [...prev, s])
    // eslint-disable-next-line no-console
    console.log('[LIFF-DEBUG]', s)
  }

  /**
   * run()
   * @param checkOnly true = 只檢查，不登入；false = 會在未登入時觸發 liff.login()
   */
  async function run(checkOnly = true) {
    try {
      log('Start')
      setEnvId(process.env.NEXT_PUBLIC_LIFF_ID)

      const { default: liff } = await import('@line/liff')
      log('liff imported. version=' + (liff as any)?.version)

      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2007831464-7LDjNnmD'
      log('liff.init ... id=' + liffId)

      await liff.init({
        liffId,
        withLoginOnExternalBrowser: true, // 外部瀏覽器必須為 true
      })

      // --- ready 兼容 + 看門狗: 最多等 1 秒，沒回就往下 ---
      let readyResolved = false
      try {
        // @ts-ignore
        if (liff.ready && typeof liff.ready.then === 'function') {
          const p: Promise<void> = liff.ready
          await Promise.race([
            p.then(() => {
              readyResolved = true
              log('liff.ready resolved')
            }),
            new Promise<void>((resolve) =>
              setTimeout(() => {
                log('liff.ready timeout -> continue anyway')
                resolve()
              }, 1000)
            ),
          ])
        } else {
          log('liff.ready not a Promise, skip waiting')
        }
      } catch (e: any) {
        log('liff.ready error: ' + (e?.message || String(e)))
      }

      const url = new URL(window.location.href)
      const hasCode = url.searchParams.has('code')
      const hasState = url.searchParams.has('state')
      log(`URL params -> code=${hasCode} state=${hasState}`)

      const isInClient = liff.isInClient()
      const isLoggedIn = liff.isLoggedIn()
      log(`isInClient=${isInClient} isLoggedIn=${isLoggedIn} ready=${readyResolved}`)

      let idToken: string | null = null
      let accessToken: string | null = null
      let profile: any = null

      if (isLoggedIn) {
        idToken = liff.getIDToken()
        accessToken = liff.getAccessToken()
        log(`tokens -> idToken=${!!idToken} accessToken=${!!accessToken}`)
        try {
          profile = await liff.getProfile()
          log(`profile -> ${profile?.displayName || '(no name)'}`)
        } catch (e: any) {
          log('getProfile error: ' + (e?.message || String(e)))
        }
      } else {
        // ✅ 預設「只檢查」：不自動登入
        if (!checkOnly) {
          if (!hasCode && !hasState) {
            const redirectUri = window.location.href
            log('call liff.login redirectUri=' + redirectUri)
            liff.login({ redirectUri })
            return
          } else {
            log('has code/state but isLoggedIn=false -> force reload once')
            setTimeout(() => {
              window.location.replace(window.location.href)
            }, 500)
            return
          }
        } else {
          log('checkOnly=true -> skip login')
        }
      }

      setStatus({
        url: window.location.href,
        envId: process.env.NEXT_PUBLIC_LIFF_ID,
        isInClient,
        isLoggedIn,
        hasCode,
        hasState,
        idTokenExists: !!idToken,
        accessTokenExists: !!accessToken,
        profile,
      })
    } catch (e: any) {
      log('FATAL: ' + (e?.message || String(e)))
      setStatus({ error: e?.message || String(e) })
    }
  }

  useEffect(() => {
    // ✅ 預設改為「只檢查」（不登入）
    run(true).catch((e) => log('run(true) unhandled: ' + (e?.message || String(e))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <h1>LIFF Debug</h1>

      <div style={{ margin: '8px 0' }}>
        <button onClick={() => run(true)} style={{ padding: '8px 12px', marginRight: 8 }}>
          只檢查狀態（不登入）
        </button>
        <button onClick={() => run(false)} style={{ padding: '8px 12px' }}>
          觸發登入（按下才會 login）
        </button>
      </div>

      <div style={{ margin: '8px 0' }}>
        <b>NEXT_PUBLIC_LIFF_ID:</b> {envId || '(undefined)'}
      </div>

      <pre>{JSON.stringify(status, null, 2)}</pre>

      <h3>Logs</h3>
      <ol>
        {logs.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>

      <p>
        若看到 <b>isLoggedIn=true</b>、<b>idTokenExists=true</b>、<b>accessTokenExists=true</b>，表示 LIFF 登入流程正常。
      </p>
    </div>
  )
}
