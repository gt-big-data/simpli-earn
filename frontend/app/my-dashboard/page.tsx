'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import NavBar from '@/components/Navbar'
import WatchlistWidget from '@/components/my-dashboard/WatchlistWidget'
import UpcomingEarningsWidget from '@/components/my-dashboard/UpcomingEarningsWidget'
import IndustryNewsWidget from '@/components/my-dashboard/IndustryNewsWidget'

/**
 * Widget config - easy to reorder, add, or remove widgets in future.
 * When drag-and-drop is added, this drives the layout.
 */
const WIDGET_CONFIG = [
  { id: 'watchlist', Component: WatchlistWidget },
  { id: 'upcoming-earnings', Component: UpcomingEarningsWidget },
  { id: 'industry-news', Component: IndustryNewsWidget },
] as const

export default function MyDashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login?next=/my-dashboard')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <h1 className="mb-8 text-2xl font-light tracking-tight text-foreground">
          My Dashboard
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WIDGET_CONFIG.map(({ id, Component }) => (
            <Component key={id} userId={user.id} />
          ))}
        </div>
      </main>
    </div>
  )
}
