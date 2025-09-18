// /pages/expired.tsx
'use client'

import { useRouter } from 'next/router'
import { Button } from '@/components/ui/button'

export default function ExpiredPage() {
  const router = useRouter()

  return (
    <main className="bg-[#0B0B0B] min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,.35)] p-8 text-center">
        <h1 className="text-2xl font-extrabold mb-4 text-red-400">⚠️ 試用已到期</h1>
        <p className="text-white/80 mb-6 leading-relaxed">
          您的店家帳號試用期已結束，系統已自動停用。<br />
          若需繼續使用服務，請聯繫管理員或負責人辦理續約。
        </p>

        <div className="flex flex-col space-y-3">
          <Button
            variant="warning"
            onClick={() => router.replace('/admin/login')}
            className="w-full"
          >
            返回管理員登入
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.replace('/')}
            className="w-full"
          >
            回首頁
          </Button>
        </div>

        <p className="text-xs text-white/50 mt-6">
          若有疑問，請洽系統管理員或客服人員
        </p>
      </div>
    </main>
  )
}
