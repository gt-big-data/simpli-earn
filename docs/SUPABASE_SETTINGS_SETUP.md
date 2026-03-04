# Supabase Setup for User Settings / Account Management

Follow these steps in your Supabase project to enable the full settings page (avatar upload, delete account).

---

## 1. Create Avatars Storage Bucket

1. Go to **Storage** in the Supabase Dashboard.
2. Click **New bucket**.
3. Name: `avatars`
4. Enable **Public bucket** (so avatar images can be displayed).
5. Optional: set **File size limit** to 2 MB.
6. Optional: set **Allowed MIME types** to `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
7. Click **Create bucket**.

---

## 2. Add Storage RLS Policies

Go to **SQL Editor** → **New Query**, then paste and run the contents of `docs/supabase_avatars_storage.sql`.

**Important:** With `upsert: true`, Supabase needs SELECT (to check if file exists), INSERT (for new files), and UPDATE (to overwrite). All four policies (SELECT, INSERT, UPDATE, DELETE) must be present.

The policies ensure users can only access files under `avatars/{their_user_id}/`.

---

## 3. Add Service Role Key for Delete Account

1. Open `frontend/.env.local`.
2. Add:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
3. In Supabase Dashboard → **Project Settings** → **API**, copy the **service_role** key (not the anon key).

**Important:** The service role bypasses RLS and must never be exposed to the client. It is only used in the Next.js API route `/api/auth/delete-account`.

---

## 4. Email Change (Optional)

If users change email and you use **Confirm email** in Supabase:

- **Authentication** → **Providers** → **Email** → **Confirm email** = ON  
- Users receive a confirmation email before the new email takes effect.

---

## 5. Sync Profile with Auth

The `profiles` table stores `full_name`, `email`, and `avatar_url`. The settings page:

- Updates `auth.users` for email and user metadata.
- Updates `profiles` for `full_name`, `email`, `avatar_url`, and `sector_preferences`.

A trigger could keep `profiles.email` in sync with `auth.users`, but the app updates both so it’s not required.

---

## Checklist

- [ ] `avatars` bucket created and set to **Public**
- [ ] Storage RLS policies added
- [ ] `SUPABASE_SERVICE_ROLE_KEY` added to `frontend/.env.local`
