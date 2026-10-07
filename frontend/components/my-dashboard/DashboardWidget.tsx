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
      className="surface flex min-h-[200px] flex-col rounded-2xl p-6"
    >
      <h2 className="mb-4 text-sm font-medium tracking-wide text-brand">
        {title}
      </h2>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </section>
  )
}
