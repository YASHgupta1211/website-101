import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

export function SiteHeader({ studio = false }: { studio?: boolean }) {
  const { user, profile, profileError, loading, updateProfile, logout } = useAuth()
  const [draft, setDraft] = useState({ name: '', business: '' })
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const profileButton = useRef<HTMLButtonElement>(null)
  const displayName = profile?.name || user?.displayName || ''
  const initials = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open && dialog.current?.open) dialog.current.close()
  }, [open])
  useEffect(() => { if (!user) setOpen(false) }, [user])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFeedback('')
    try {
      await updateProfile(draft.name.trim(), draft.business.trim())
      setFeedback('Your account details have been saved.')
    } catch {
      setFeedback('Your details could not be saved. Please try again.')
    } finally { setSaving(false) }
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
      {user ? <button ref={profileButton} className="profile-avatar" type="button" aria-label={displayName ? `View profile for ${displayName}` : 'Open your account'} aria-haspopup="dialog" onClick={() => { setDraft({ name: profile?.name || user.displayName || '', business: profile?.business || '' }); setFeedback(''); setOpen(true) }}>
        {initials || <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>}
      </button> : <a className="header-signin" href="/signin">{loading ? 'Checking session...' : 'Sign in'}</a>}
    </header>
    <dialog ref={dialog} className="profile-dialog" aria-labelledby="profile-heading" aria-describedby="profile-description" onCancel={() => setOpen(false)} onClose={() => { setOpen(false); profileButton.current?.focus() }}>
      <div className="profile-dialog-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="profile-heading">Your account</h2></div><button className="profile-close" type="button" aria-label="Close profile" onClick={() => setOpen(false)}>&times;</button></div>
      <p id="profile-description">These details belong to your signed-in account.</p>
      <form onSubmit={saveProfile} className="profile-form">
        <label>Your name<input autoFocus name="name" autoComplete="name" maxLength={80} disabled={saving} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Business name<input name="business" autoComplete="organization" maxLength={120} disabled={saving} value={draft.business} onChange={event => setDraft({ ...draft, business: event.target.value })} /></label>
        <label>Email address<input type="email" readOnly value={user?.email || ''} /></label>
        {user?.phoneNumber && <label>Verified phone<input type="tel" readOnly value={user.phoneNumber} /></label>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save details'}</button>
        {feedback && <p className="profile-feedback" role="status">{feedback}</p>}
        {profileError && <p className="error-message" role="alert">{profileError}</p>}
      </form>
      <button className="secondary-button account-signout" type="button" disabled={saving} onClick={() => { void logout().catch(() => setFeedback('Sign-out could not be completed. Please try again.')) }}>Sign out</button>
    </dialog>
  </>
}

export function SiteFooter() {
  return <footer className="footer"><a className="brand footer-brand" href="/">jewel<span className="brand-light">studio</span></a><span>Jewelry catalog photography</span><a href="/studio">Open dashboard</a></footer>
}
