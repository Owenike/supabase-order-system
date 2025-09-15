'use client'

import React from 'react'
import type { OptionGroup, OptionValue } from '@/utils/fetchItemOptions'

type Props = {
  groups: OptionGroup[]
  value: Record<string, string | string[]>
  onChange: (next: Record<string, string | string[]>) => void
}

/**
 * 取值優先用 value，沒有就退回 label（避免舊資料沒 value）
 */
const codeOf = (v: { label: string; value?: string }) => (v.value ?? v.label).toString().trim()

/**
 * 深色頁面的膠囊樣式：選中黃底，不選白/10 邊框
 */
const pill = (selected: boolean) =>
  selected
    ? 'bg-yellow-400 text-black border-yellow-400'
    : 'bg-white/10 text-white border border-white/15 hover:bg-white/15'

/**
 * 價差顯示（+NT$ 10 / -NT$ 5）
 */
const deltaText = (d?: number) => {
  if (typeof d !== 'number' || Number.isNaN(d) || d === 0) return ''
  const sign = d > 0 ? '+' : ''
  return ` ${sign}NT$ ${Math.abs(d)}`
}

/**
 * 取得目前 group 的已選值（單選回字串，多選回陣列）
 */
const getSelected = (
  value: Record<string, string | string[]>,
  key: string,
  isSingle: boolean
): string | string[] => {
  const v = value[key]
  if (isSingle) return typeof v === 'string' ? v : ''
  return Array.isArray(v) ? v : []
}

export default function ItemOptionPicker({ groups, value, onChange }: Props) {
  if (!Array.isArray(groups) || groups.length === 0) return null

  const setSingle = (optId: string, v: string) => {
    onChange({ ...value, [optId]: v })
  }

  const toggleMulti = (optId: string, v: string) => {
    const prev = Array.isArray(value[optId]) ? (value[optId] as string[]) : []
    const next = prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    onChange({ ...value, [optId]: next })
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const isSingle = g.input_type === 'single'
        const selected = getSelected(value, g.id, isSingle)

        return (
          <section
            key={g.id}
            aria-label={g.name}
            role="group"
            className="rounded-lg"
          >
            {/* 標題列 */}
            <div className="mb-2 flex items-center gap-2">
              <p className="font-medium text-white">
                {g.name}
                {g.required ? (
                  <span className="ml-1 text-red-400 align-middle">*</span>
                ) : (
                  <span className="ml-2 text-xs text-white/50 align-middle">（選填）</span>
                )}
              </p>
              <span className="text-xs px-2 py-0.5 rounded-full border border-white/15 text-white/80 bg-white/10">
                {isSingle ? '單選' : '多選'}
              </span>
            </div>

            {/* 選項列 */}
            <div className="flex flex-wrap gap-2">
              {g.values.map((opt: OptionValue) => {
                const code = codeOf(opt)
                const isSelected = isSingle
                  ? (selected as string) === code
                  : Array.isArray(selected) && (selected as string[]).includes(code)

                const handleClick = () => {
                  if (isSingle) setSingle(g.id, code)
                  else toggleMulti(g.id, code)
                }

                const priceDeltaText = deltaText(opt.price_delta)

                return (
                  <button
                    key={code}
                    type="button"
                    onClick={handleClick}
                    aria-pressed={isSelected}
                    aria-label={`${opt.label}${priceDeltaText ? `，${priceDeltaText}` : ''}`}
                    className={[
                      'rounded-full px-3 py-1.5 text-sm transition',
                      'focus:outline-none focus:ring-2 focus:ring-yellow-400/60 focus:ring-offset-0',
                      pill(isSelected),
                    ].join(' ')}
                    title={priceDeltaText || undefined}
                  >
                    {opt.label}
                    {priceDeltaText}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
