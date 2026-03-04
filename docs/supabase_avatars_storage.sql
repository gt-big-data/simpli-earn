-- =============================================================================
-- Supabase Storage: Avatars Bucket - RLS Policies
-- Run in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =============================================================================
--
-- Prerequisite: Create bucket "avatars" in Storage UI (Public, 2MB limit recommended)
--
-- These policies allow authenticated users to upload/update/delete avatars
-- only in their own folder: avatars/{user_id}/...
--
-- IMPORTANT: upsert: true requires SELECT + INSERT + UPDATE policies
-- =============================================================================

-- Drop existing policies if re-running (adjust names if you used different ones)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can select own avatar" ON storage.objects;

-- SELECT: Required for upsert to check if file exists
CREATE POLICY "Users can select own avatar"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars' AND
  split_part(name, '/', 1) = auth.uid()::text
);

-- INSERT: Upload new avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  split_part(name, '/', 1) = auth.uid()::text
);

-- UPDATE: Overwrite existing (upsert)
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  split_part(name, '/', 1) = auth.uid()::text
);

-- DELETE: Remove avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  split_part(name, '/', 1) = auth.uid()::text
);
