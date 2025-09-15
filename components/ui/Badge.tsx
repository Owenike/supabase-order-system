'use client'
import React from 'react'

type Tone = 'success' | 'warning' | 'info' | 'muted'
const tone: Record<Tone, string> = {
  success: 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
  info:    'bg-sky-500/15 text-sky-300 border border-sky-400/20',
  muted:   'bg-white/10 text-white/70 border border-white/10',
}

export default function Badge({ children, t='muted', className='' }:{
  children: React.ReactNode; t?: Tone; className?: string
}) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${tone[t]} ${className}`}>{children}</span>
}
