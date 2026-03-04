'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/AuthContext'
import NavBar from '@/components/Navbar'
import { SECTOR_PREFERENCES } from '@/lib/auth/constants'
import type { SectorPreferenceSlug } from '@/lib/auth/constants'
import { FaUserCircle } from 'react-icons/fa'

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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#81D18D]" />
      </div>
    )
  }

  const inputClass =
    'w-full py-2.5 px-4 bg-[rgba(234,250,236,0.08)] rounded-lg border border-[rgba(129,209,141,0.25)] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81D18D]/50 focus:border-[#81D18D]'
  const labelClass = 'block text-sm font-medium text-gray-300 mb-2'
  const sectionClass =
    'rounded-xl border border-[rgba(129,209,141,0.2)] bg-[rgba(0,0,0,0.3)] p-6 mb-6'

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] font-montserrat"
      style={{
        background:
          'radial-gradient(50% 50% at 50% 0%, rgba(129, 209, 141, 0.06) 0%, transparent 50%)',
      }}
    >
      <NavBar />

      <main className="pt-28 pb-16 px-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-medium text-white mb-6 tracking-tight">
          Account
        </h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-[#81D18D]/20 text-[#81D18D]'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Avatar */}
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-[#81D18D] uppercase tracking-wider mb-4">
            Avatar
          </h2>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-[rgba(129,209,141,0.15)] flex items-center justify-center shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="object-cover w-full h-full"
                />
              ) : (
                <FaUserCircle className="text-[#81D18D]/60" size={48} />
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
                className="text-sm text-[#81D18D] hover:underline disabled:opacity-50"
              >
                Change
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={loading}
                  className="text-sm text-gray-400 hover:text-red-400 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Name, Email & Sectors */}
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-[#81D18D] uppercase tracking-wider mb-4">
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
              <p className="text-xs text-gray-500 mt-1">
                Changing email may require verification.
              </p>
            </div>
            <div>
              <label className={`${labelClass} mb-2`}>Sectors of Interest</label>
              <div className="space-y-2">
                {SECTOR_PREFERENCES.map(({ slug, label }) => (
                  <label
                    key={slug}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(234,250,236,0.06)] border border-[rgba(129,209,141,0.15)] cursor-pointer hover:border-[rgba(129,209,141,0.3)] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={sectorPreferences.includes(slug)}
                      onChange={() => toggleSector(slug)}
                      className="accent-[#81D18D] rounded"
                    />
                    <span className="text-white text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-6 rounded-lg bg-[#81D18D] text-[#121612] font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
            >
              Save
            </button>
          </form>
        </section>

        {/* Password */}
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-[#81D18D] uppercase tracking-wider mb-4">
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
              className="py-2.5 px-6 rounded-lg bg-[#81D18D] text-[#121612] font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
            >
              Update Password
            </button>
          </form>
        </section>

        {/* Logout */}
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-[#81D18D] uppercase tracking-wider mb-4">
            Session
          </h2>
          <button
            type="button"
            onClick={() => signOut().then(() => router.push('/'))}
            className="py-2.5 px-6 rounded-lg border border-[rgba(129,209,141,0.4)] text-gray-300 hover:bg-[rgba(129,209,141,0.1)] hover:text-white transition-colors"
          >
            Log out
          </button>
        </section>

        {/* Delete Account */}
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-red-400/90 uppercase tracking-wider mb-4">
            Danger Zone
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="py-2.5 px-6 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete Account
          </button>
        </section>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
          <div className="rounded-xl border border-red-500/30 bg-[#121612] p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Account</h3>
            <p className="text-gray-400 text-sm mb-4">
              Type <strong className="text-white">delete</strong> to confirm.
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
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setDeleteModalOpen(false)
                  setDeleteConfirmText('')
                }}
                className="flex-1 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800"
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
