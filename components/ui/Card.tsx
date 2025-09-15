'use client'
import React from 'react'
export function Card({ children, className='' }:{children: React.ReactNode; className?: string}) {
  return <div className={`bg-white text-gray-900 rounded-lg shadow border border-gray-200 ${className}`}>{children}</div>
}
export function CardHeader({ title, subtitle }:{title:string; subtitle?:string}) {
  return (
    <div className="px-4 py-3 border-b border-gray-200">
      <h3 className="text-lg font-semibold">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}
export function CardBody({ children, className='' }:{children:React.ReactNode; className?:string}) {
  return <div className={`p-4 ${className}`}>{children}</div>
}
