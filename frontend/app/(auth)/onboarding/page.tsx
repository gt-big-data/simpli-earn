'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  INVESTING_GOALS,
  EXPERIENCE_LEVELS,
  SECTOR_PREFERENCES,
} from '@/lib/auth/constants'
import type { InvestingGoalSlug, ExperienceLevelSlug, SectorPreferenceSlug } from '@/lib/auth/constants'

const STEPS = [
  {
    id: 1,
    title: 'What are you investing for?',
    required: true,
  },
  {
    id: 2,
    title: 'How familiar are you with investing?',
    required: true,
  },
  {
    id: 3,
    title: 'Sector preferences',
    required: false,
  },
] as const

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth()
  const [step, setStep] = useState(1)
  const [investingGoal, setInvestingGoal] = useState<InvestingGoalSlug | ''>('')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevelSlug | ''>('')
  const [sectorPreferences, setSectorPreferences] = useState<SectorPreferenceSlug[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?next=/onboarding')
    }
  }, [user, authLoading, router])

  const toggleSector = (slug: SectorPreferenceSlug) => {
    setSectorPreferences((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  const canProceed = () => {
    if (step === 1) return !!investingGoal
    if (step === 2) return !!experienceLevel
    return true
  }

  const handleNext = () => {
    setSubmitError(null)
    if (step < 3) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    setSubmitError(null)
    if (step > 1) setStep(step - 1)
  }

  const handleSubmit = async () => {
    if (!user) return
    setSubmitting(true)
    setSubmitError(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        investing_goal: investingGoal,
        experience_level: experienceLevel,
        sector_preferences: sectorPreferences,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      setSubmitError(error.message)
      setSubmitting(false)
      return
    }

    router.push('/my-dashboard')
    setSubmitting(false)
  }

  if (authLoading || !user) {
    return (
      <div className="surface w-full max-w-md rounded-2xl p-8 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-brand" />
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const optionClass =
    'flex cursor-pointer items-center gap-3 rounded-xl border border-white/8 bg-black/20 p-4 transition-colors hover:bg-white/5'

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-10">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s.id <= step ? 'bg-brand' : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      <div className="surface rounded-2xl p-8">
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-medium text-foreground">
              What are you investing for?
            </h2>
            <p className="text-sm text-muted-foreground">We&apos;ll tailor insights to your goals.</p>
            <div className="space-y-2">
              {INVESTING_GOALS.map(({ slug, label }) => (
                <label
                  key={slug}
                  className={`${optionClass} ${investingGoal === slug ? 'border-brand bg-accent' : ''}`}
                >
                  <input
                    type="radio"
                    name="investing_goal"
                    value={slug}
                    checked={investingGoal === slug}
                    onChange={() => setInvestingGoal(slug)}
                    className="sr-only accent-brand"
                  />
                  <span className="text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-medium text-foreground">
              How familiar are you with investing?
            </h2>
            <p className="text-sm text-muted-foreground">Helps us match content to your level.</p>
            <div className="space-y-2">
              {EXPERIENCE_LEVELS.map(({ slug, label }) => (
                <label
                  key={slug}
                  className={`${optionClass} ${experienceLevel === slug ? 'border-brand bg-accent' : ''}`}
                >
                  <input
                    type="radio"
                    name="experience_level"
                    value={slug}
                    checked={experienceLevel === slug}
                    onChange={() => setExperienceLevel(slug)}
                    className="sr-only accent-brand"
                  />
                  <span className="text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-medium text-foreground">
              Sector preferences
            </h2>
            <p className="text-sm text-muted-foreground">Select any that interest you. Optional.</p>
            <div className="space-y-2">
              {SECTOR_PREFERENCES.map(({ slug, label }) => (
                <label
                  key={slug}
                  className={`${optionClass} ${sectorPreferences.includes(slug) ? 'border-brand bg-accent' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={sectorPreferences.includes(slug)}
                    onChange={() => toggleSector(slug)}
                    className="rounded accent-brand"
                  />
                  <span className="text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {submitError && (
          <div className="mt-6 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="btn-outline px-6"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={(step <= 2 && !canProceed()) || submitting}
            className="btn-primary flex-1"
          >
            {submitting
              ? 'Saving...'
              : step === 3
                ? 'Get started'
                : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
