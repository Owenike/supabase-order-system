'use client'

import { useEffect } from 'react'

export default function RedirectPage() {
  useEffect(() => {
    console.log('⏳ redirect.tsx loaded，準備跳轉到 /store')
    setTimeout(() => {
      window.location.replace('/store')
    }, 300)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-700 text-lg">
      正在導向後台，請稍候...
    </div>
  )
}
