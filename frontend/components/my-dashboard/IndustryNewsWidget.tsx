'use client'

import DashboardWidget from './DashboardWidget'

interface IndustryNewsWidgetProps {
  userId?: string | null
}

export default function IndustryNewsWidget({  }: IndustryNewsWidgetProps) {
  return (
    <DashboardWidget title="Industry News" widgetId="industry-news">
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <p>News from sectors you care about.</p>
      </div>
    </DashboardWidget>
  )
}
