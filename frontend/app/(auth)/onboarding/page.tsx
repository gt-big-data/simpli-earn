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
      <div className="rounded-xl border border-[rgba(129,209,141,0.26)] bg-[rgba(0,0,0,0.4)] p-8 text-center w-full max-w-md">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#81D18D] mx-auto" />
        <p className="text-gray-400 mt-4">Loading...</p>
      </div>
    )
  }

  const optionClass =
    'flex items-center gap-3 p-4 rounded-xl bg-[rgba(234,250,236,0.06)] border border-[rgba(129,209,141,0.2)] cursor-pointer hover:border-[rgba(129,209,141,0.4)] transition-all'

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-10">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s.id <= step ? 'bg-[#81D18D]' : 'bg-[rgba(129,209,141,0.2)]'
            }`}
          />
        ))}
      </div>

      <div className="rounded-xl border border-[rgba(129,209,141,0.2)] bg-[rgba(0,0,0,0.3)] p-8 shadow-[0px_0px_12px_0px_rgba(129,209,141,0.08)]">
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white">
              What are you investing for?
            </h2>
            <p className="text-gray-400 text-sm">We&apos;ll tailor insights to your goals.</p>
            <div className="space-y-2">
              {INVESTING_GOALS.map(({ slug, label }) => (
                <label
                  key={slug}
                  className={`${optionClass} ${investingGoal === slug ? 'border-[#81D18D] ring-1 ring-[#81D18D]/30' : ''}`}
                >
                  <input
                    type="radio"
                    name="investing_goal"
                    value={slug}
                    checked={investingGoal === slug}
                    onChange={() => setInvestingGoal(slug)}
                    className="accent-[#81D18D] sr-only"
                  />
                  <span className="text-white">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white">
              How familiar are you with investing?
            </h2>
            <p className="text-gray-400 text-sm">Helps us match content to your level.</p>
            <div className="space-y-2">
              {EXPERIENCE_LEVELS.map(({ slug, label }) => (
                <label
                  key={slug}
                  className={`${optionClass} ${experienceLevel === slug ? 'border-[#81D18D] ring-1 ring-[#81D18D]/30' : ''}`}
                >
                  <input
                    type="radio"
                    name="experience_level"
                    value={slug}
                    checked={experienceLevel === slug}
                    onChange={() => setExperienceLevel(slug)}
                    className="accent-[#81D18D] sr-only"
                  />
                  <span className="text-white">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white">
              Sector preferences
            </h2>
            <p className="text-gray-400 text-sm">Select any that interest you. Optional.</p>
            <div className="space-y-2">
              {SECTOR_PREFERENCES.map(({ slug, label }) => (
                <label
                  key={slug}
                  className={`${optionClass} ${sectorPreferences.includes(slug) ? 'border-[#81D18D] ring-1 ring-[#81D18D]/30' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={sectorPreferences.includes(slug)}
                    onChange={() => toggleSector(slug)}
                    className="accent-[#81D18D] rounded"
                  />
                  <span className="text-white">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {submitError && (
          <div className="mt-6 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
            {submitError}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="py-3 px-6 rounded-xl border border-[rgba(129,209,141,0.3)] text-gray-300 hover:border-[#81D18D] hover:text-white transition-all"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={(step <= 2 && !canProceed()) || submitting}
            className="flex-1 py-3 rounded-xl bg-[#81D18D] text-[#121612] font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
