'use client'

import React from 'react'
import type { OptionGroup, OptionValue } from '@/utils/fetchItemOptions'

type Props = {
  groups: OptionGroup[]
  value: Record<string, string | string[]>
  onChange: (next: Record<string, string | string[]>) => void
}

const codeOf = (v: { label: string; value?: string }) => (v.value ?? v.label) // value 不在就用 label

// 深色頁面的膠囊樣式：選中黃底，不選白/10 邊框
const pill = (selected: boolean) =>
  selected
    ? 'bg-yellow-400 text-black border-yellow-400'
    : 'bg-white/10 text-white border border-white/15 hover:bg-white/15'

// 價差顯示（+NT$ 10 / -NT$ 5）
const deltaText = (d?: number) => {
  if (typeof d !== 'number' || d === 0) return ''
  const sign = d > 0 ? '+' : ''
  return ` ${sign}NT$ ${Math.abs(d)}`
}

export default function ItemOptionPicker({ groups, value, onChange }: Props) {
  if (!groups.length) return null

  const setSingle = (optId: string, v: string) => onChange({ ...value, [optId]: v })

  const toggleMulti = (optId: string, v: string) => {
    const prev = (value[optId] as string[]) || []
    const next = prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    onChange({ ...value, [optId]: next })
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const isSingle = g.input_type === 'single'
        return (
          <div key={g.id}>
            <div className="mb-2 flex items-center gap-2">
              <p className="font-medium text-white">
                {g.name}
                {g.required && <span className="ml-1 text-red-400">*</span>}
              </p>
              <span className="text-xs px-2 py-0.5 rounded-full border border-white/15 text-white/80 bg-white/10">
                {isSingle ? '單選' : '多選'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {g.values.map((opt: OptionValue) => {
                const code = codeOf(opt)
                const isSelected = isSingle
                  ? value[g.id] === code
                  : Array.isArray(value[g.id]) && (value[g.id] as string[]).includes(code)

                const handleClick = () => {
                  if (isSingle) setSingle(g.id, code)
                  else toggleMulti(g.id, code)
                }

                return (
                  <button
                    key={code}
                    type="button"
                    onClick={handleClick}
                    aria-pressed={isSelected}
                    className={[
                      'rounded-full px-3 py-1.5 text-sm transition focus:outline-none',
                      'focus:ring-2 focus:ring-yellow-400/60 focus:ring-offset-0',
                      pill(isSelected),
                    ].join(' ')}
                    title={deltaText(opt.price_delta) || undefined}
                  >
                    {opt.label}
                    {deltaText(opt.price_delta)}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
