'use client'

import DashboardWidget from './DashboardWidget'

interface WatchlistWidgetProps {
  userId?: string | null
}

export default function WatchlistWidget({  }: WatchlistWidgetProps) {
  return (
    <DashboardWidget title="Watchlist" widgetId="watchlist">
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <p>Your tracked tickers will appear here.</p>
      </div>
    </DashboardWidget>
  )
}
