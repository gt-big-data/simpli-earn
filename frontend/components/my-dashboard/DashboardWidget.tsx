'use client'

import React from 'react'

interface DashboardWidgetProps {
  title: string
  children?: React.ReactNode
  /** Optional: for future drag-and-drop / customization */
  widgetId?: string
}

export default function DashboardWidget({ title, children, widgetId }: DashboardWidgetProps) {
  return (
    <section
      data-widget-id={widgetId}
      className="rounded-xl border border-[rgba(129,209,141,0.2)] bg-[rgba(0,0,0,0.3)] p-6 shadow-[0px_0px_8px_0px_rgba(129,209,141,0.08)] min-h-[200px] flex flex-col"
    >
      <h2 className="text-sm font-semibold text-[#81D18D] uppercase tracking-wider mb-4">
        {title}
      </h2>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </section>
  )
}
