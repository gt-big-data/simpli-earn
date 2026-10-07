'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/AuthContext'
import NavBar from '@/components/Navbar'
import { SECTOR_PREFERENCES } from '@/lib/auth/constants'
import type { SectorPreferenceSlug } from '@/lib/auth/constants'
import { UserRound } from 'lucide-react'

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [sectorPreferences, setSectorPreferences] = useState<SectorPreferenceSlug[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?next=/settings')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return

    const loadProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, avatar_url, sector_preferences')
        .eq('id', user.id)
        .single()

      if (data) {
        setFullName(data.full_name || '')
        setEmail(data.email || user.email || '')
        setAvatarUrl(data.avatar_url || null)
        setSectorPreferences((data.sector_preferences as SectorPreferenceSlug[]) || [])
      } else {
        setEmail(user.email || '')
      }
    }
    loadProfile()
  }, [user?.id])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files?.[0]) return
    const file = e.target.files[0]
    if (file.size > 2 * 1024 * 1024) {
      showMessage('error', 'Image must be under 2MB')
      return
    }

    setLoading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      showMessage('error', uploadError.message)
      setLoading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (updateError) {
      showMessage('error', updateError.message)
    } else {
      setAvatarUrl(publicUrl)
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      showMessage('success', 'Avatar updated')
    }
    setLoading(false)
  }

  const handleRemoveAvatar = async () => {
    if (!user) return
    setLoading(true)
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      showMessage('error', error.message)
    } else {
      setAvatarUrl(null)
      showMessage('success', 'Avatar removed')
    }
    setLoading(false)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setMessage(null)

    const { error: authError } = await supabase.auth.updateUser({
      email: email.trim() || undefined,
      data: { full_name: fullName.trim() || undefined },
    })
    if (authError) {
      showMessage('error', authError.message)
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        email: email.trim() || null,
        sector_preferences: sectorPreferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (profileError) {
      showMessage('error', profileError.message)
    } else {
      showMessage('success', 'Profile saved')
    }
    setLoading(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      showMessage('error', 'Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      showMessage('error', 'Passwords do not match')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      showMessage('error', error.message)
    } else {
      setNewPassword('')
      setConfirmPassword('')
      showMessage('success', 'Password updated')
    }
    setLoading(false)
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'delete') return
    setLoading(true)
    const res = await fetch('/api/auth/delete-account', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      showMessage('error', data.error || 'Failed to delete account')
      setLoading(false)
      setDeleteModalOpen(false)
      return
    }
    await signOut()
    router.replace('/')
    setLoading(false)
    setDeleteModalOpen(false)
  }

  const toggleSector = (slug: SectorPreferenceSlug) => {
    setSectorPreferences((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    )
  }

  const inputClass = 'field'
  const labelClass = 'mb-2 block text-sm font-medium text-muted-foreground'
  const sectionClass = 'surface mb-6 rounded-2xl p-6'

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="pt-28 pb-16 px-6 max-w-2xl mx-auto">
        <h1 className="mb-6 text-2xl font-light tracking-tight text-foreground">
          Account
        </h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-accent text-brand'
                : 'bg-destructive/15 text-destructive'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Avatar */}
        <section className={sectionClass}>
          <h2 className="mb-4 text-sm font-medium text-brand">
            Avatar
          </h2>
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="object-cover w-full h-full"
                />
              ) : (
                <UserRound className="size-8 text-brand/70" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="text-sm text-brand disabled:opacity-50"
              >
                Change
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={loading}
                  className="text-sm text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Name, Email & Sectors */}
        <section className={sectionClass}>
          <h2 className="mb-4 text-sm font-medium text-brand">
            Profile
          </h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label htmlFor="fullName" className={labelClass}>
                Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                placeholder="Your name"
              />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Changing email may require verification.
              </p>
            </div>
            <div>
              <label className={`${labelClass} mb-2`}>Sectors of Interest</label>
              <div className="space-y-2">
                {SECTOR_PREFERENCES.map(({ slug, label }) => (
                  <label
                    key={slug}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/8 bg-black/20 p-3 transition-colors hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={sectorPreferences.includes(slug)}
                      onChange={() => toggleSector(slug)}
                      className="rounded accent-brand"
                    />
                    <span className="text-sm text-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-6"
            >
              Save
            </button>
          </form>
        </section>

        {/* Password */}
        <section className={sectionClass}>
          <h2 className="mb-4 text-sm font-medium text-brand">
            Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className={labelClass}>
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                minLength={6}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className={labelClass}>
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-6"
            >
              Update Password
            </button>
          </form>
        </section>

        {/* Logout */}
        <section className={sectionClass}>
          <h2 className="mb-4 text-sm font-medium text-brand">
            Session
          </h2>
          <button
            type="button"
            onClick={() => signOut().then(() => router.push('/'))}
            className="btn-outline px-6"
          >
            Log out
          </button>
        </section>

        {/* Delete Account */}
        <section className={sectionClass}>
          <h2 className="mb-4 text-sm font-medium text-destructive">
            Danger Zone
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="btn-destructive px-6"
          >
            Delete Account
          </button>
        </section>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
          <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-popover p-6">
            <h3 className="mb-2 text-lg font-medium text-foreground">Delete Account</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Type <strong className="text-foreground">delete</strong> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className={`${inputClass} mb-4`}
              placeholder="delete"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'delete' || loading}
                className="btn-destructive flex-1"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setDeleteModalOpen(false)
                  setDeleteConfirmText('')
                }}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
