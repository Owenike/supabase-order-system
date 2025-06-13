import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function SelectTablePage() {
  const router = useRouter()
  const [storeId, setStoreId] = useState('')

  useEffect(() => {
    const id = localStorage.getItem('store_id')
    if (id) setStoreId(id)
  }, [])

  const tableList = Array.from({ length: 30 }, (_, i) => `${i + 1}`)

  const handleSelect = (table: string) => {
    if (!storeId) {
      alert('無法取得店家 ID')
      return
    }
    router.push(`/order?store=${storeId}&table=${table}`)
  }

  return (
    <div className="p-6 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">🛍 外帶顧客點餐</h1>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {tableList.map((table) => (
          <button
            key={table}
            onClick={() => handleSelect(table)}
            className="border rounded px-4 py-2 hover:bg-blue-600 hover:text-white"
          >
            桌號 {table}
          </button>
        ))}
      </div>
    </div>
  )
}
