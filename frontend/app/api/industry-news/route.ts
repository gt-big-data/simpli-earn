import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SECTOR_PREFERENCES } from '@/lib/auth/constants'
import type { SectorPreferenceSlug } from '@/lib/auth/constants'

export const runtime = 'nodejs'

const MAX_ARTICLES = 12
// A new sign-in refreshes the digest, but no more often than this
const MIN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
// Digests kept per user; older ones are pruned after each new fetch
const DIGESTS_KEPT_PER_USER = 20
// Bump when the provider query or article normalization changes, so stored digests are not reused
const QUERY_VERSION = '18d-v2'

// Concurrent requests for the same user and sectors (e.g. two tabs right after login) share one fetch
const inFlight = new Map<string, Promise<ProviderResult>>()

type ProviderResult =
  | { ok: true; articles: IndustryArticle[] }
  | { ok: false; status: number; error: string }

type StoredDigest = { articles: IndustryArticle[]; created_at: string }

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

async function fetchFromProvider(preferences: SectorPreferenceSlug[], apiKey: string): Promise<ProviderResult> {
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
      return { ok: false, status: 502, error: 'News provider request failed' }
    }

    const payload: unknown = await response.json()
    const providerError = asText(asRecord(payload).error)
    if (providerError) {
      console.error('NewsAPI.ai query rejected:', providerError)
      return { ok: false, status: 502, error: 'News provider rejected the search query' }
    }
    return { ok: true, articles: normalizeArticles(payload, preferences) }
  } catch (error) {
    console.error('Industry news request error:', error instanceof Error ? error.message : 'Unknown error')
    return { ok: false, status: 502, error: 'Unable to load industry news' }
  }
}

/** Refresh only on a sign-in newer than the digest, and at most once per MIN_REFRESH_INTERVAL_MS. */
function digestIsCurrent(digest: StoredDigest, lastSignInAt: string | undefined, now: number): boolean {
  const createdAt = Date.parse(digest.created_at)
  if (Number.isNaN(createdAt)) return false
  if (now - createdAt < MIN_REFRESH_INTERVAL_MS) return true
  const signedInAt = lastSignInAt ? Date.parse(lastSignInAt) : NaN
  // Same session as the digest: keep it until the user signs in again
  return !Number.isNaN(signedInAt) && signedInAt <= createdAt
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

  const sectors = [...new Set(preferences)].sort()
  const sectorKey = `${QUERY_VERSION}:${sectors.join(',')}`

  // Latest stored digest for these sectors. A read error (e.g. migration 006 not run) falls through
  // to a live fetch so the widget still works, just without the per-user reuse.
  const { data: latestRow, error: readError } = await supabase
    .from('user_news_digests')
    .select('articles, created_at')
    .eq('user_id', user.id)
    .eq('sector_key', sectorKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (readError) console.error('Industry news digest lookup failed:', readError.message)
  const latest = (latestRow as StoredDigest | null) ?? null

  if (latest && digestIsCurrent(latest, user.last_sign_in_at, Date.now())) {
    return NextResponse.json({ articles: latest.articles, sectors: preferences, cached: true, generatedAt: latest.created_at })
  }

  const apiKey = process.env.NEWSAPI_AI_KEY
  if (!apiKey) {
    console.error('NEWSAPI_AI_KEY is not configured')
    if (latest) return NextResponse.json({ articles: latest.articles, sectors: preferences, cached: true, generatedAt: latest.created_at })
    return NextResponse.json({ error: 'Industry news is not configured' }, { status: 503 })
  }

  const flightKey = `${user.id}:${sectorKey}`
  let pending = inFlight.get(flightKey)
  const ownsFetch = !pending
  if (!pending) {
    pending = fetchFromProvider(sectors, apiKey)
    inFlight.set(flightKey, pending)
  }
  let result: ProviderResult
  try {
    result = await pending
  } finally {
    if (ownsFetch) inFlight.delete(flightKey)
  }

  if (!result.ok) {
    // Serve the previous digest, however old, rather than an error
    if (latest) return NextResponse.json({ articles: latest.articles, sectors: preferences, cached: true, generatedAt: latest.created_at })
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  let generatedAt = new Date().toISOString()
  if (ownsFetch && !readError) {
    const { data: inserted, error: insertError } = await supabase
      .from('user_news_digests')
      .insert({ user_id: user.id, sector_key: sectorKey, sectors, articles: result.articles })
      .select('created_at')
      .single()
    if (insertError) {
      console.error('Industry news digest save failed:', insertError.message)
    } else {
      generatedAt = inserted.created_at
      await pruneOldDigests(supabase, user.id)
    }
  }

  return NextResponse.json({ articles: result.articles, sectors: preferences, cached: false, generatedAt })
}

async function pruneOldDigests(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: stale, error } = await supabase
    .from('user_news_digests')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(DIGESTS_KEPT_PER_USER, DIGESTS_KEPT_PER_USER + 99)
  if (error || !stale?.length) return
  const { error: deleteError } = await supabase
    .from('user_news_digests')
    .delete()
    .in('id', stale.map((row: { id: string }) => row.id))
  if (deleteError) console.error('Industry news digest prune failed:', deleteError.message)
}
