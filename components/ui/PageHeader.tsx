'use client'
import React from 'react'

export default function PageHeader({
  icon, title, subtitle, actions,
}:{ icon?: React.ReactNode; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between px-4 sm:px-6 md:px-10 pt-2 pb-4">
      <div className="flex items-center gap-3">
        {icon && <div className="text-yellow-400">{icon}</div>}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="text-white/70 text-sm mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
