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
    <div className="rounded-xl border border-[rgba(129,209,141,0.26)] bg-[rgba(0,0,0,0.4)] p-8 shadow-[0px_0px_8px_0px_rgba(129,209,141,0.25)]">
      <h1 className="text-2xl font-bold text-center mb-6 text-white">
        Welcome back
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
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
            className="w-full py-2 px-4 bg-[rgba(234,250,236,0.14)] rounded-lg border border-[rgba(129,209,141,0.3)] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81D18D]"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-[#81D18D] text-[#121612] font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign in'}
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
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-[#81D18D] hover:underline">
          Sign up
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-[rgba(129,209,141,0.26)] bg-[rgba(0,0,0,0.4)] p-8 animate-pulse h-64" />}>
      <LoginForm />
    </Suspense>
  )
}
