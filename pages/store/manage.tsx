'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * /store/manage 導覽頁
 * - 僅顯示 2 顆膠囊按鈕（左：加料管理 / 右：新增分類與菜單）
 * - 風格參考你提供的 Ocard 雙按鈕截圖：左黃、右深色、圓角滿版
 * - 保留了讀取 store_id 的邏輯（如果你要做權限判斷或導向可自行加上）
 */
export default function StoreManagePage() {
  const [storeId, setStoreId] = useState<string | null>(null)

  useEffect(() => {
    // 可視需要把 store_id 當作門檻（例如沒有就導回 /login）
    const sid = typeof window !== 'undefined' ? localStorage.getItem('store_id') : null
    setStoreId(sid)
  }, [])

  return (
    <div className="relative min-h-[70vh] flex items-center justify-center">
      {/* 若頁面有大圖或影片背景，可以在外層放，這裡先給個半透明遮罩 */}
      <div className="absolute inset-0 bg-black/60 pointer-events-none" aria-hidden />

      <div className="relative z-10 w-full max-w-3xl px-4">
        <h1 className="sr-only">店家後台管理導覽</h1>

        {/* 膠囊群組：左黃右深色，圓角、陰影、hover 效果 */}
        <div className="mx-auto flex w-full max-w-xl items-center justify-center">
          <div className="inline-flex overflow-hidden rounded-full shadow-lg ring-1 ring-black/10">
            {/* 左側：加料管理（黃底黑字） */}
            <Link
              href="/store/manage-addons"
              className="
                px-7 py-3
                font-semibold
                bg-yellow-400 text-black
                hover:bg-yellow-300
                transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300
              "
            >
              加料管理
            </Link>

            {/* 右側：新增分類與菜單（半透明深色底白字） */}
            <Link
              href="/store/manage-menus"
              className="
                px-7 py-3
                font-semibold
                bg-white/10 text-white
                hover:bg-white/20
                backdrop-blur
                transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40
              "
            >
              新增分類與菜單
            </Link>
          </div>
        </div>

        {/* 補充資訊區（可依需要保留或移除） */}
        <div className="mx-auto mt-6 w-full max-w-xl text-center text-sm text-white/80">
          {storeId ? (
            <p>目前店家 ID：<span className="font-mono">{storeId}</span></p>
          ) : (
            <p>尚未取得店家 ID（如需權限檢查，請先於登入後寫入 localStorage 的 <code>store_id</code>）。</p>
          )}
        </div>
      </div>
    </div>
  )
}
