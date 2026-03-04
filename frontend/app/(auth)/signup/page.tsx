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
      <div className="rounded-xl border border-[rgba(129,209,141,0.26)] bg-[rgba(0,0,0,0.4)] p-8 shadow-[0px_0px_8px_0px_rgba(129,209,141,0.25)] text-center">
        <h1 className="text-2xl font-bold mb-4 text-white">Check your email</h1>
        <p className="text-gray-400 mb-6">
          We sent a confirmation link to <strong className="text-white">{email}</strong>.
          Click the link to activate your account.
        </p>
        <p className="text-sm text-gray-500">
          Didn&apos;t receive the email? Check your spam folder or{' '}
          <Link href="/signup" className="text-[#81D18D] hover:underline">
            try again
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[rgba(129,209,141,0.26)] bg-[rgba(0,0,0,0.4)] p-8 shadow-[0px_0px_8px_0px_rgba(129,209,141,0.25)]">
      <h1 className="text-2xl font-bold text-center mb-6 text-white">
        Create your account
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="fullName" className="block text-sm text-gray-300 mb-1">
            Name
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full py-2 px-4 bg-[rgba(234,250,236,0.14)] rounded-lg border border-[rgba(129,209,141,0.3)] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81D18D]"
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full py-2 px-4 bg-[rgba(234,250,236,0.14)] rounded-lg border border-[rgba(129,209,141,0.3)] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81D18D]"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-gray-300 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full py-2 px-4 bg-[rgba(234,250,236,0.14)] rounded-lg border border-[rgba(129,209,141,0.3)] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81D18D]"
            placeholder="At least 6 characters"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm text-gray-300 mb-1">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="w-full py-2 px-4 bg-[rgba(234,250,236,0.14)] rounded-lg border border-[rgba(129,209,141,0.3)] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81D18D]"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-[#81D18D] text-[#121612] font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating account...' : 'Sign up'}
        </button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-600" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[rgba(0,0,0,0.4)] px-2 text-gray-500">or</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => signInWithGoogle()}
          disabled={loading}
          className="w-full py-3 rounded-lg border border-[rgba(129,209,141,0.3)] text-gray-300 hover:bg-[rgba(234,250,236,0.08)] transition-all disabled:opacity-50"
        >
          Continue with Google
        </button>
      </form>
      <p className="mt-6 text-center text-gray-400 text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-[#81D18D] hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-gray-500 text-xs">
        <Link href="/" className="hover:text-gray-400">
          ← Back to home
        </Link>
      </p>
    </div>
  )
}
