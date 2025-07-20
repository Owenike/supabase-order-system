'use client'

import { useEffect, useState } from 'react'

export default function StoreDebugPage() {
  const [storeId, setStoreId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    const sid = localStorage.getItem('store_id')
    const aid = localStorage.getItem('store_account_id')

    setStoreId(sid || '(無 store_id)')
    setAccountId(aid || '(無 store_account_id)')

    const debugLog: string[] = []

    debugLog.push(`✅ 目前網址：${window.location.pathname}`)
    debugLog.push(`🧾 store_id：${sid || 'null'}`)
    debugLog.push(`🧾 store_account_id：${aid || 'null'}`)

    const isValid = sid && /^[0-9a-f-]{36}$/.test(sid)
    debugLog.push(`🔍 store_id 格式是否有效：${isValid ? '✅ 是' : '❌ 否'}`)

    setLogs(debugLog)
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-2xl font-bold text-center text-gray-800 mb-4">
        🧪 Store Debug Page
      </h1>

      <div className="bg-white rounded shadow p-4 space-y-3 max-w-md mx-auto">
        <p className="text-sm text-gray-700">
          <strong>store_id：</strong> {storeId}
        </p>
        <p className="text-sm text-gray-700">
          <strong>store_account_id：</strong> {accountId}
        </p>

        <hr />

        <h2 className="font-semibold text-gray-700 text-sm">Log 記錄：</h2>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          {logs.map((log, idx) => (
            <li key={idx}>{log}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
