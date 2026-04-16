'use client'

import DashboardWidget from './DashboardWidget'

interface UpcomingEarningsWidgetProps {
  userId?: string | null
}

export default function UpcomingEarningsWidget({  }: UpcomingEarningsWidgetProps) {
  return (
    <DashboardWidget title="Upcoming Earnings" widgetId="upcoming-earnings">
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        <p>Earnings calls relevant to your watchlist.</p>
      </div>
    </DashboardWidget>
  )
}
