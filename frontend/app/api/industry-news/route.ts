import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SECTOR_PREFERENCES } from '@/lib/auth/constants'
import type { SectorPreferenceSlug } from '@/lib/auth/constants'

export const runtime = 'nodejs'

const CACHE_TTL_MS = 15 * 60 * 1000
const MAX_ARTICLES = 12
const cache = new Map<string, { expiresAt: number; articles: IndustryArticle[] }>()

type IndustryArticle = {
  title: string
  url: string
  source: string
  publishedAt: string | null
  imageUrl: string | null
  industry: string
}

// Keep provider query vocabulary server-side and keyed by the profile's canonical slugs.
const SECTOR_TERMS: Record<SectorPreferenceSlug, string[]> = {
  // Two phrases per sector keeps every possible preference combination below the
  // 15-keyword limit on the free NewsAPI.ai subscription.
  broad_market: ['stock market', 'corporate earnings'],
  tech_innovation: ['artificial intelligence', 'semiconductor'],
  consumer_brands: ['retail', 'consumer brands'],
  healthcare_pharma: ['healthcare', 'pharmaceutical'],
  energy_sustainability: ['renewable energy', 'oil and gas'],
  financials_real_estate: ['banking', 'real estate'],
}

const SECTOR_CLASSIFIERS: Record<SectorPreferenceSlug, string[]> = {
  broad_market: ['stock market', 'equities', 'corporate earnings', 'federal reserve', 's&p 500', 'nasdaq', 'dow jones', 'gdp', 'inflation'],
  tech_innovation: ['artificial intelligence', 'semiconductor', 'computer chip', 'software', 'cybersecurity', 'cloud computing', 'robotics', 'technology', 'data center', 'smartphone'],
  consumer_brands: ['consumer goods', 'retail', 'consumer brand', 'e-commerce', 'retailer', 'apparel', 'food and beverage'],
  healthcare_pharma: ['healthcare', 'pharmaceutical', 'biotechnology', 'clinical trial', 'medical', 'hospital', 'drug approval', 'fda'],
  energy_sustainability: ['renewable energy', 'oil and gas', 'solar power', 'wind power', 'electric vehicle', 'battery', 'clean energy', 'utility'],
  financials_real_estate: ['banking', 'financial services', 'real estate', 'insurance', 'mortgage', 'credit', 'fintech', 'interest rate'],
}
const SECTOR_LABELS = Object.fromEntries(SECTOR_PREFERENCES.map(({ slug, label }) => [slug, label])) as Record<SectorPreferenceSlug, string>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function articleMetadataText(article: Record<string, unknown>, field: 'categories' | 'concepts'): string {
  const labels: string[] = []
  const values = article[field]
  if (!Array.isArray(values)) return ''
  for (const value of values) {
    if (typeof value === 'string') labels.push(value)
    else {
      const item = asRecord(value)
      const label = asText(item.label) ?? asText(item.uri)
      if (label) labels.push(label)
    }
  }
  return normalizeText(labels.join(' '))
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function hasSectorSignal(text: string, terms: string[]): boolean {
  const normalized = normalizeText(text)
  return terms.some((term) => {
    const normalizedTerm = normalizeText(term)
    return normalizedTerm.length > 0 && ` ${normalized} `.includes(` ${normalizedTerm} `)
  })
}

function inferIndustry(
  article: Record<string, unknown>,
  selectedSectors: SectorPreferenceSlug[],
): SectorPreferenceSlug | null {
  const title = normalizeText(asText(article.title) ?? '')
  const categories = articleMetadataText(article, 'categories')
  const concepts = articleMetadataText(article, 'concepts')
  let bestSector: SectorPreferenceSlug | null = null
  let bestScore = -1
  for (const sector of selectedSectors) {
    const terms = SECTOR_CLASSIFIERS[sector]
    const titleMatch = hasSectorSignal(title, terms)
    const categoryMatch = hasSectorSignal(categories, terms)
    const conceptMatch = hasSectorSignal(concepts, terms)

    // A title match is strong relevance evidence. Metadata-only matches must be
    // independently supported by both categories and concepts to avoid noisy labels.
    if (!titleMatch && !(categoryMatch && conceptMatch)) continue
    const score = (titleMatch ? 4 : 0) + (categoryMatch ? 2 : 0) + (conceptMatch ? 1 : 0)
    if (score > bestScore) {
      bestSector = sector
      bestScore = score
    }
  }
  return bestSector
}

function normalizeArticles(payload: unknown, selectedSectors: SectorPreferenceSlug[]): IndustryArticle[] {
  const articles = asRecord(asRecord(payload).articles).results
  if (!Array.isArray(articles)) return []

  const seen = new Set<string>()
  const normalized: IndustryArticle[] = []
  for (const item of articles) {
    const article = asRecord(item)
    const title = asText(article.title)
    const url = asText(article.url)
    if (!title || !url) continue
    try {
      if (new URL(url).protocol !== 'https:') continue
    } catch {
      continue
    }
    if (seen.has(url)) continue

    const source = asRecord(article.source)
    const industrySlug = inferIndustry(article, selectedSectors)
    // Drop body-only keyword matches whose headline and enrichment don't support
    // any selected industry. This prevents unrelated stories receiving a guessed tag.
    if (!industrySlug) continue
    seen.add(url)

    normalized.push({
      title,
      url,
      source: asText(source.title) ?? asText(source.uri) ?? 'News source',
      publishedAt: asText(article.dateTimePub) ?? asText(article.dateTime),
      imageUrl: asText(article.image),
      industry: SECTOR_LABELS[industrySlug],
    })
    if (normalized.length >= MAX_ARTICLES) break
  }
  return normalized
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('sector_preferences')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Industry news profile lookup failed:', profileError.message)
    return NextResponse.json({ error: 'Unable to load preferences' }, { status: 500 })
  }

  const validSlugs = new Set(Object.keys(SECTOR_TERMS))
  const preferences = Array.isArray(profile.sector_preferences)
    ? profile.sector_preferences.filter((slug): slug is SectorPreferenceSlug =>
      typeof slug === 'string' && validSlugs.has(slug))
    : []
  if (!preferences.length) return NextResponse.json({ articles: [], sectors: [] })

  const cacheKey = `18d-v2:${[...new Set(preferences)].sort().join(',')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ articles: cached.articles, sectors: preferences, cached: true })
  }

  const apiKey = process.env.NEWSAPI_AI_KEY
  if (!apiKey) {
    console.error('NEWSAPI_AI_KEY is not configured')
    return NextResponse.json({ error: 'Industry news is not configured' }, { status: 503 })
  }

  const keywords = [...new Set(preferences.flatMap((slug) => SECTOR_TERMS[slug]))]
  const today = new Date()
  const startDate = new Date(today.getTime() - 18 * 24 * 60 * 60 * 1000)
  const toDateString = (date: Date) => date.toISOString().slice(0, 10)
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let response: Response
    try {
      response = await fetch('https://eventregistry.org/api/v1/article/getArticles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getArticles',
          keyword: keywords,
          keywordOper: 'or',
          keywordLoc: 'body,title',
          lang: 'eng',
          articlesPage: 1,
          articlesCount: 100,
          articlesSortBy: 'date',
          articlesSortByAsc: false,
          articlesArticleBodyLen: 0,
          includeArticleImage: true,
          includeArticleCategories: true,
          includeArticleConcepts: true,
          dateStart: toDateString(startDate),
          dateEnd: toDateString(today),
          resultType: 'articles',
          forceMaxDataTimeWindow: 31,
          apiKey,
        }),
        signal: controller.signal,
        cache: 'no-store',
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      console.error('NewsAPI.ai request failed:', response.status)
      const stale = cache.get(cacheKey)
      if (stale?.articles.length) return NextResponse.json({ articles: stale.articles, sectors: preferences, cached: true })
      return NextResponse.json({ error: 'News provider request failed' }, { status: 502 })
    }

    const payload: unknown = await response.json()
    const providerError = asText(asRecord(payload).error)
    if (providerError) {
      console.error('NewsAPI.ai query rejected:', providerError)
      const stale = cache.get(cacheKey)
      if (stale?.articles.length) return NextResponse.json({ articles: stale.articles, sectors: preferences, cached: true })
      return NextResponse.json({ error: 'News provider rejected the search query' }, { status: 502 })
    }
    const articles = normalizeArticles(payload, preferences)

    cache.set(cacheKey, { articles, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ articles, sectors: preferences, cached: false })
  } catch (error) {
    console.error('Industry news request error:', error instanceof Error ? error.message : 'Unknown error')
    const stale = cache.get(cacheKey)
    if (stale?.articles.length) return NextResponse.json({ articles: stale.articles, sectors: preferences, cached: true })
    return NextResponse.json({ error: 'Unable to load industry news' }, { status: 502 })
  }
}
