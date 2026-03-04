/**
 * User preference options for onboarding
 * These slugs match the database CHECK constraints
 */

export const INVESTING_GOALS = [
  { slug: 'long_term_wealth_growth', label: 'Long-term wealth growth' },
  { slug: 'saving_for_major_purchase', label: 'Saving for a major purchase' },
  { slug: 'passive_income', label: 'Passive income' },
  { slug: 'learning_how_investing_works', label: 'Learning how investing works' },
  { slug: 'short_term_gains', label: 'Short-term gains' },
] as const

export const EXPERIENCE_LEVELS = [
  { slug: 'completely_new', label: 'Completely new' },
  { slug: 'know_the_basics', label: 'Know the basics' },
  { slug: 'some_experience', label: 'Some experience' },
  { slug: 'actively_manage_investments', label: 'Actively manage investments' },
] as const

export const SECTOR_PREFERENCES = [
  { slug: 'broad_market', label: 'Broad Market' },
  { slug: 'tech_innovation', label: 'Tech & Innovation' },
  { slug: 'consumer_brands', label: 'Consumer Brands' },
  { slug: 'healthcare_pharma', label: 'Healthcare & Pharmaceuticals' },
  { slug: 'energy_sustainability', label: 'Energy & Sustainability' },
  { slug: 'financials_real_estate', label: 'Financials & Real Estate' },
] as const

export type InvestingGoalSlug = (typeof INVESTING_GOALS)[number]['slug']
export type ExperienceLevelSlug = (typeof EXPERIENCE_LEVELS)[number]['slug']
export type SectorPreferenceSlug = (typeof SECTOR_PREFERENCES)[number]['slug']
