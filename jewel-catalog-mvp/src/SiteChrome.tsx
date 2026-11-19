import { type FormEvent, useEffect, useRef, useState } from 'react'

type Profile = { name: string; business: string; email: string }
const PROFILE_KEY = 'jewel-studio-profile-v1'
const EMPTY_PROFILE: Profile = { name: '', business: '', email: '' }

export function readProfile(): Profile {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
    if (value && typeof value === 'object') {
      const profile = value as Record<string, unknown>
      if (['name', 'business', 'email'].every(key => typeof profile[key] === 'string')) {
        return { name: profile.name as string, business: profile.business as string, email: profile.email as string }
      }
    }
  } catch { /* The profile remains optional when browser storage is unavailable. */ }
  return EMPTY_PROFILE
}

export function SiteHeader({ studio = false, onProfileChange }: { studio?: boolean; onProfileChange?: (profile: Profile) => void }) {
  const [profile, setProfile] = useState<Profile>(readProfile)
  const [draft, setDraft] = useState(profile)
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const profileButton = useRef<HTMLButtonElement>(null)
  const initials = profile.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()

  useEffect(() => {
    if (open) dialog.current?.showModal()
    else if (dialog.current?.open) dialog.current.close()
  }, [open])

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = { name: draft.name.trim(), business: draft.business.trim(), email: draft.email.trim() }
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(saved))
      setProfile(saved)
      onProfileChange?.(saved)
      setFeedback('Your details are saved in this browser.')
    } catch {
      setFeedback('Your browser could not save these details. Please allow local storage and try again.')
    }
  }

  return <>
    <header className="topbar site-header">
      <a className="brand" href="/" aria-label="Jewel Studio home"><span className="brand-monogram" aria-hidden="true">J</span><span>jewel<span className="brand-light">studio</span></span></a>
      <nav className="page-navigation" aria-label="Main navigation">
        <a href="/" aria-current={!studio ? 'page' : undefined}>Home</a>
        <a className="section-nav-link" href="/#how-it-works">Process</a>
        <a className="section-nav-link" href="/#gallery">The studio</a>
        <a className="dashboard-nav-link" href="/studio" aria-current={studio ? 'page' : undefined}>Dashboard</a>
      </nav>
      <button ref={profileButton} className="profile-avatar" type="button" aria-label={profile.name ? `View profile for ${profile.name}` : 'Open your profile'} aria-haspopup="dialog" onClick={() => { setDraft(profile); setFeedback(''); setOpen(true) }}>
        {initials || <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>}
      </button>
    </header>
    <dialog ref={dialog} className="profile-dialog" aria-labelledby="profile-heading" aria-describedby="profile-description" onCancel={() => setOpen(false)} onClose={() => { setOpen(false); profileButton.current?.focus() }}>
      <div className="profile-dialog-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="profile-heading">Your profile</h2></div><button className="profile-close" type="button" aria-label="Close profile" onClick={() => setOpen(false)}>×</button></div>
      <p id="profile-description">Personalize this browser's workspace. These details are stored on this device.</p>
      <form onSubmit={saveProfile} className="profile-form">
        <label>Your name<input autoFocus name="name" autoComplete="name" maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Business name<input name="business" autoComplete="organization" maxLength={120} value={draft.business} onChange={event => setDraft({ ...draft, business: event.target.value })} /></label>
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} /></label>
        <button className="primary-button" type="submit">Save details</button>
        {feedback && <p className="profile-feedback" role="status">{feedback}</p>}
      </form>
      <p className="profile-storage-note">Browser profile · Account sign-in is coming later.</p>
    </dialog>
  </>
}

export function SiteFooter() {
  return <footer className="footer"><a className="brand footer-brand" href="/">jewel<span className="brand-light">studio</span></a><span>Jewelry catalog photography</span><a href="/studio">Open dashboard</a></footer>
}
