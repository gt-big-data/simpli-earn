'use client'

import { useCallback, useEffect, useState } from 'react'
import DashboardWidget from './DashboardWidget'

interface IndustryNewsWidgetProps {
  userId?: string | null
}

interface Article {
  title: string
  url: string
  source: string
  publishedAt: string | null
  imageUrl: string | null
  industry: string
}

export default function IndustryNewsWidget({ userId }: IndustryNewsWidgetProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [sectors, setSectors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadArticles = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const response = await fetch('/api/industry-news', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to fetch industry news')
      const data = await response.json() as { articles?: Article[]; sectors?: string[] }
      setArticles(data.articles ?? [])
      setSectors(data.sectors ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (userId) void loadArticles()
  }, [userId, loadArticles])

  const formatDate = (date: string | null) => {
    if (!date) return ''
    const parsed = new Date(date)
    return Number.isNaN(parsed.getTime())
      ? ''
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parsed)
  }

  return (
    <DashboardWidget title="Industry News" widgetId="industry-news">
      {loading ? (
        <div className="space-y-3" aria-label="Loading industry news">
          {[0, 1, 2].map((item) => <div key={item} className="h-10 animate-pulse rounded bg-white/5" />)}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-gray-400">
          <p>Industry news couldn&apos;t load right now.</p>
          <button onClick={() => void loadArticles()} className="text-[#81D18D] hover:underline">Try again</button>
        </div>
      ) : sectors.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-gray-400">
          <p>Select sectors of interest in <a href="/settings" className="text-[#81D18D] hover:underline">Settings</a> to see relevant news.</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-gray-400">
          <p>No recent stories found for your selected sectors.</p>
        </div>
      ) : (
        <ul aria-label="Industry news articles" className="max-h-[26rem] overflow-y-auto overscroll-contain pr-2 divide-y divide-white/10">
          {articles.map((article) => (
            <li key={article.url} className="py-2.5 first:pt-0 last:pb-0">
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="group block">
                <span className="mb-1 block text-xs font-semibold text-[#81D18D]">{article.industry}</span>
                <span className="line-clamp-2 text-sm leading-snug text-gray-200 group-hover:text-[#81D18D]">{article.title}</span>
                <span className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
                  <span>{article.source}</span>
                  {formatDate(article.publishedAt) && <><span aria-hidden="true">·</span><time dateTime={article.publishedAt ?? undefined}>{formatDate(article.publishedAt)}</time></>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
