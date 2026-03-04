'use client'

import DashboardWidget from './DashboardWidget'

interface IndustryNewsWidgetProps {
  userId?: string | null
}

export default function IndustryNewsWidget({ userId }: IndustryNewsWidgetProps) {
  return (
    <DashboardWidget title="Industry News" widgetId="industry-news">
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        <p>News from sectors you care about.</p>
      </div>
    </DashboardWidget>
  )
}
