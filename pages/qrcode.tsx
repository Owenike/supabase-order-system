import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useReactToPrint } from 'react-to-print'
import { useRouter } from 'next/router'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const QRCodePage = () => {
  const [storeId, setStoreId] = useState('')
  const router = useRouter()
  const printRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('store_id')
    if (!id) {
      router.push('/login')
      return
    }
    setStoreId(id)
  }, [router])

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `QRCode列印`,
  } as any)

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    alert(`已複製連結：${url}`)
  }

  const handleDownloadPDF = async () => {
    const element = printRef.current
    if (!element) return

    const canvas = await html2canvas(element, { scale: 2 })
    const imgData = canvas.toDataURL('image/png')

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let positionY = 0
    if (imgHeight < pageHeight) {
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
    } else {
      let heightLeft = imgHeight

      while (heightLeft > 0) {
        pdf.addImage(imgData, 'PNG', 0, positionY, imgWidth, imgHeight)
        heightLeft -= pageHeight
        if (heightLeft > 0) {
          pdf.addPage()
          positionY = -pageHeight
        }
      }
    }

    pdf.save('QRCode.pdf')
  }

  if (!storeId) return null

  const baseUrl = 'http://localhost:3000/order'
  const tables = Array.from({ length: 30 }, (_, i) => (i + 1).toString())

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 print:hidden">🧾 QRCode 產生器（共 {tables.length} 張）</h1>

      <div className="flex justify-end mb-4 gap-2 print:hidden">
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          列印
        </button>
        <button
          onClick={handleDownloadPDF}
          className="px-4 py-2 bg-purple-600 text-white rounded"
        >
          下載 PDF
        </button>
      </div>

      <div ref={printRef} className="grid grid-cols-2 md:grid-cols-5 gap-6">
        {tables.map((table) => {
          const url = `${baseUrl}?store=${storeId}&table=${table}`
          return (
            <div key={table} className="border rounded p-4 flex flex-col items-center">
              <QRCodeCanvas value={url} size={120} />
              <p className="mt-2 font-semibold">桌號：{table}</p>
              <p className="text-xs text-center break-all">{url}</p>
              <button
                onClick={() => handleCopy(url)}
                className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded print:hidden"
              >
                複製連結
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QRCodePage
