# Auth Implementation – Step-by-Step Guide

Follow these steps to complete and test the SimpliEarn auth system.

---

## Step 1: Run the database migration

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. Go to **SQL Editor** → **New Query**.
3. Copy the contents of `docs/supabase_profiles_migration.sql` and paste into the editor.
4. Click **Run**. You should see success messages.

This creates:
- `profiles` table with preference columns
- Trigger to create a profile when a user signs up
- RLS policies for per-user access

---

## Step 2: Add your Supabase Anon key

1. In Supabase Dashboard, go to **Project Settings** → **API**.
2. Find the **anon** / **public** key (not the service_role key).
3. Open `frontend/.env.local` and set:

   ```
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here
   ```

The URL is already set for your project.

---

## Step 3: Configure Supabase Auth URLs (if needed)

1. Go to **Authentication** → **URL Configuration**.
2. Set **Site URL** to `http://localhost:3000` (for dev).
3. Add **Redirect URLs**:
   - `http://localhost:3000/**`
   - `http://localhost:3000/auth/callback`

---

## Step 4: Optional – disable email confirmation for faster testing

1. Go to **Authentication** → **Providers** → **Email**.
2. Turn **off** “Confirm email” to let users sign in immediately without email verification.
3. In production, keep this enabled.

---

## Step 5: Start the app and test

```bash
# From project root – start backend services first (in separate terminals)
source venv/bin/activate
cd RAG && uvicorn api_chatbot:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
source venv/bin/activate
cd sentiment && uvicorn api:app --reload --host 0.0.0.0 --port 8001

# Terminal 3 – frontend
cd frontend
npm run dev
```

Open **http://localhost:3000**.

---

## Step 6: Test the auth flow

1. **Sign up**
   - Click **Sign Up** in the navbar.
   - Enter email and password (min 6 characters).
   - Submit.

2. **If email confirmation is OFF**
   - You are signed in right away and redirected to **Onboarding**.

3. **Onboarding**
   - Choose investing goal (required).
   - Choose experience level (required).
   - Optionally select sector preferences.
   - Click **Continue to SimpliEarn** → redirect to Dashboard.

4. **Logout and login**
   - Click **Logout** in the navbar.
   - Click **Login**, enter your email/password, and sign in.

5. **Auth callback** (for email confirmation)
   - With confirmation ON, users receive an email.
   - Clicking the link goes to `/auth/callback`.
   - The app exchanges the code for a session and redirects to onboarding or dashboard.

---

## Files created

| Path | Purpose |
|------|---------|
| `frontend/lib/supabase/client.ts` | Browser Supabase client |
| `frontend/lib/supabase/server.ts` | Server Supabase client |
| `frontend/lib/supabase/middleware.ts` | Session refresh logic |
| `frontend/lib/auth/AuthContext.tsx` | Auth state provider |
| `frontend/lib/auth/constants.ts` | Preference options |
| `frontend/lib/auth/providers.ts` | Google OAuth placeholder |
| `frontend/app/auth/callback/route.ts` | OAuth/email callback handler |
| `frontend/app/(auth)/login/page.tsx` | Login page |
| `frontend/app/(auth)/signup/page.tsx` | Sign up page |
| `frontend/app/(auth)/onboarding/page.tsx` | Preferences onboarding |
| `frontend/app/(auth)/layout.tsx` | Auth pages layout |
| `frontend/middleware.ts` | Session refresh middleware |

---

## Adding Google OAuth later

1. Get Google OAuth credentials from [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Enable the Google provider in Supabase: **Authentication** → **Providers** → **Google**.
3. Add the Google Client ID and Secret.
4. In your login page, add a button that calls `signInWithGoogle()` from `lib/auth/providers.ts`.
5. The existing `/auth/callback` route already handles the OAuth redirect.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Invalid API key" | Use the **anon** key, not the service_role key. |
| "profiles table does not exist" | Run `docs/supabase_profiles_migration.sql` in the Supabase SQL Editor. |
| Callback redirects to login with error | Check redirect URLs in Supabase → Authentication → URL Configuration. |
| Session not persisting | Ensure `middleware.ts` runs on the matched routes (check matcher). |
| Onboarding shows "Loading..." forever | Confirm `profiles` RLS allows the user to read/update their own row. |
