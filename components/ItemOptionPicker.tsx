'use client';

import React from 'react';
import type { OptionGroup, OptionValue } from '@/utils/fetchItemOptions';

type Props = {
  groups: OptionGroup[];
  value: Record<string, string | string[]>;
  onChange: (next: Record<string, string | string[]>) => void;
};

export default function ItemOptionPicker({ groups, value, onChange }: Props) {
  if (!groups.length) return null;

  const setSingle = (optId: string, v: string) =>
    onChange({ ...value, [optId]: v });

  const toggleMulti = (optId: string, v: string) => {
    const prev = (value[optId] as string[]) || [];
    const next = prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v];
    onChange({ ...value, [optId]: next });
  };

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="font-medium mb-2">
            {g.name}{g.required && <span className="ml-1 text-red-600">*</span>}
          </p>

          <div className="flex flex-wrap gap-2">
            {g.values.map((opt: OptionValue) => {
              const isSelected =
                g.input_type === 'single'
                  ? value[g.id] === opt.value
                  : Array.isArray(value[g.id]) && (value[g.id] as string[]).includes(opt.value);

              const toggle = () => {
                if (g.input_type === 'single') {
                  setSingle(g.id, opt.value);
                } else {
                  toggleMulti(g.id, opt.value);
                }
              };

              const hasDelta = typeof opt.price_delta === 'number' && opt.price_delta !== 0;

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={toggle}
                  aria-pressed={isSelected}
                  className={`px-3 py-1 rounded border ${
                    isSelected ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50'
                  }`}
                  title={hasDelta ? `+${opt.price_delta}` : undefined}
                >
                  {opt.label}{hasDelta ? ` +$${opt.price_delta}` : ''}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
