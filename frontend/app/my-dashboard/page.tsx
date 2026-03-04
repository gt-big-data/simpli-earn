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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#81D18D]" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] font-montserrat"
      style={{
        background: 'radial-gradient(50% 50% at 50% 0%, rgba(129, 209, 141, 0.08) 0%, transparent 50%)',
      }}
    >
      <NavBar />

      <main className="pt-28 pb-16 px-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-medium text-white mb-8 tracking-tight">
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
