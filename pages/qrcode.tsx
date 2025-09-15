'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useRouter } from 'next/router'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export default function QRCodePage() {
  const [storeId, setStoreId] = useState('')
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = localStorage.getItem('store_id')
    if (!id) {
      router.push('/login')
      return
    }
    setStoreId(id)
  }, [router])

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    alert(`已複製連結：${url}`)
  }

  const handleDownloadPDF = async () => {
    const element = printRef.current
    if (!element) return

    // 隱藏不想出現在 PDF 的內容
    const toHide = element.querySelectorAll('.hide-in-pdf')
    toHide.forEach((el) => ((el as HTMLElement).style.display = 'none'))

    // 抓圖（提高 scale 提升清晰度）
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
    })
    const imgData = canvas.toDataURL('image/png')

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    // 多頁輸出：每頁位移 pageHeight 高度
    let positionY = 0
    let heightLeft = imgHeight

    pdf.addImage(imgData, 'PNG', 0, positionY, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft > 0) {
      pdf.addPage()
      positionY -= pageHeight
      pdf.addImage(imgData, 'PNG', 0, positionY, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    // 還原顯示
    toHide.forEach((el) => ((el as HTMLElement).style.display = ''))

    pdf.save('QRCode.pdf')
  }

  if (!storeId) return null

  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/order`
      : 'https://example.com/order'

  const tables = Array.from({ length: 30 }, (_, i) => (i + 1).toString())

  const allCards = [
    { label: '外帶', url: `${baseUrl}?store=${storeId}&table=外帶` }, // 若之後要穩定可改為 table=takeout
    ...tables.map((table) => ({
      label: `桌號：${table}`,
      url: `${baseUrl}?store=${storeId}&table=${table}`,
    })),
  ]

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-16 max-w-6xl mx-auto">
      {/* 頁首（與其他頁一致的深色頁首樣式） */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-2xl">🧾</div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">產生 QRCode</h1>
            <p className="text-white/70 text-sm mt-1">
              一鍵產生桌號／外帶 QR Code，支援下載 PDF 和複製連結
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
            className="inline-flex h-9 px-3 items-center rounded-md bg-white/10 text-white hover:bg-white/15 border border-white/15"
          >
            下載 PDF
          </button>
        </div>
      </div>

      {/* 內容卡片（白底） */}
      <div className="bg-white text-gray-900 rounded-lg shadow border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">QRCode 產生器</h2>
          <div className="text-sm text-gray-600">共 {allCards.length} 張</div>
        </div>

        <div className="p-4">
          <div ref={printRef} className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {allCards.map((item, index) => (
              <div key={index} className="border rounded p-4 flex flex-col items-center">
                <QRCodeCanvas value={item.url} size={120} />
                <p className="mt-2 font-semibold">{item.label}</p>
                <p className="text-xs text-center break-all hide-in-pdf">{item.url}</p>
                <button
                  onClick={() => handleCopy(item.url)}
                  className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hide-in-pdf hover:bg-blue-700"
                >
                  複製連結
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
