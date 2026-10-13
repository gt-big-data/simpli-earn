'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle } from '@/lib/auth/providers'

export default function SignUpPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: fullName.trim() || undefined },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // If email confirmation is disabled, user is already signed in - check and redirect
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
        router.push('/my-dashboard')
      }
    }
  }

  if (success) {
    return (
      <div className="surface rounded-2xl p-8 text-center">
        <h1 className="mb-4 text-2xl font-light tracking-tight text-foreground">Check your email</h1>
        <p className="mb-6 text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
          Click the link to activate your account.
        </p>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive the email? Check your spam folder or{' '}
          <Link href="/signup" className="text-brand no-underline">
            try again
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="surface rounded-2xl p-8">
      <h1 className="mb-6 text-center text-2xl font-light tracking-tight text-foreground">
        Create your account
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-muted-foreground">
            Name
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="field"
            placeholder="Your name"
          />
        </div>
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
            minLength={6}
            className="field"
            placeholder="At least 6 characters"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-muted-foreground">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="field"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Creating account...' : 'Sign up'}
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
        Already have an account?{' '}
        <Link href="/login" className="text-brand no-underline">
          Sign in
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
