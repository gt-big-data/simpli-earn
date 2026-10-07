'use client'

import DashboardWidget from './DashboardWidget'

interface UpcomingEarningsWidgetProps {
  userId?: string | null
}

export default function UpcomingEarningsWidget({  }: UpcomingEarningsWidgetProps) {
  return (
    <DashboardWidget title="Upcoming Earnings" widgetId="upcoming-earnings">
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <p>Earnings calls relevant to your watchlist.</p>
      </div>
    </DashboardWidget>
  )
}
