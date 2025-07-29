import { useState } from 'react'

export default function ConfirmPasswordModal({
  onConfirm,
  onCancel,
  email,
}: {
  onConfirm: (password: string) => void
  onCancel: () => void
  email: string
}) {
  const [password, setPassword] = useState('')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded shadow-md w-96">
        <h2 className="text-lg font-bold mb-4">再次驗證密碼</h2>
        <p className="text-sm text-gray-600 mb-2">請輸入密碼以確認刪除操作</p>
        <input
          type="password"
          className="border px-3 py-2 w-full mb-4 rounded"
          placeholder="密碼"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-1 border rounded"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(password)}
            className="bg-red-600 text-white text-sm px-4 py-1 rounded"
          >
            確認刪除
          </button>
        </div>
      </div>
    </div>
  )
}
