import { createClient } from '@/lib/supabase/client'

/**
 * Sign in with Google OAuth.
 * Enable the Google provider in Supabase Dashboard → Authentication → Providers
 * and add your Google OAuth credentials to use this.
 */
export async function signInWithGoogle() {
  const supabase = createClient()
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
}
