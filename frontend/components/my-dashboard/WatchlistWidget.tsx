'use client'

import DashboardWidget from './DashboardWidget'

interface WatchlistWidgetProps {
  userId?: string | null
}

export default function WatchlistWidget({  }: WatchlistWidgetProps) {
  return (
    <DashboardWidget title="Watchlist" widgetId="watchlist">
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        <p>Your tracked tickers will appear here.</p>
      </div>
    </DashboardWidget>
  )
}
