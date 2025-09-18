// /lib/date.ts
// 民國年（ROC）日期工具，固定以台北時區換算。
// 台灣不採用夏令時間；UTC+8 直接位移計算即可。

/** 將任何 Date 或 ISO 字串轉成台北時區的年月日（數字） */
function toTaipeiYMD(input: Date | string) {
  const d = typeof input === 'string' ? new Date(input) : input
  // 轉為台北時間（UTC+8）
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth() + 1
  const day = t.getUTCDate()
  return { y, m, d: day }
}

/** 兩位數補零 */
function zz(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

/** 以民國年顯示：例如 2025-09-18 -> 114/09/18 */
export function formatROC(input: Date | string): string {
  const { y, m, d } = toTaipeiYMD(input)
  const roc = y - 1911
  return `${roc}/${zz(m)}/${zz(d)}`
}

/** 區間格式：114/09/18~114/09/21 */
export function formatROCRange(start: Date | string, end: Date | string): string {
  return `${formatROC(start)}~${formatROC(end)}`
}

/** 是否「已到期」（now > end） */
export function isExpired(end: Date | string | null | undefined): boolean {
  if (!end) return false
  const endMs = new Date(end).getTime()
  const nowMs = Date.now()
  return nowMs > endMs
}
