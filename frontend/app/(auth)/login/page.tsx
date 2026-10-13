'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle } from '@/lib/auth/providers'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

      if (profile && !profile.onboarding_completed) {
        router.push('/onboarding')
      } else {
        router.push(searchParams.get('next') || '/dashboard')
      }
    } else {
      router.push(searchParams.get('next') || '/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="surface rounded-2xl p-8">
      <h1 className="mb-6 text-center text-2xl font-light tracking-tight text-foreground">
        Welcome back
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="field"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="field"
            placeholder="••••••••"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/8" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#111413] px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => signInWithGoogle()}
          disabled={loading}
          className="btn-outline w-full"
        >
          Continue with Google
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-brand no-underline">
          Sign up
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        <Link href="/" className="text-brand no-underline">
          ← Back to home
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="surface h-64 animate-pulse rounded-2xl p-8" />}>
      <LoginForm />
    </Suspense>
  )
}
