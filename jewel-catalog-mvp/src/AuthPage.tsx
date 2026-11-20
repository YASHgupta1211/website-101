import { type FormEvent, useEffect, useRef, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider, isSignInWithEmailLink, RecaptchaVerifier,
  sendSignInLinkToEmail, signInWithEmailLink, signInWithPhoneNumber,
  signInWithPopup, type ConfirmationResult,
} from 'firebase/auth'
import { configuredAuth } from './firebase'
import { useAuth } from './AuthContext'
import { SiteFooter, SiteHeader } from './SiteChrome'

const EMAIL_LINK_KEY = 'jewel-studio-pending-email'

function pendingEmail() {
  try { return sessionStorage.getItem(EMAIL_LINK_KEY) || '' } catch { return '' }
}

function authMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    const messages: Record<string, string> = {
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/invalid-action-code': 'This sign-in link is invalid or expired. Request a new link.',
      'auth/expired-action-code': 'This sign-in link has expired. Request a new link.',
      'auth/invalid-verification-code': 'That code is incorrect. Check the SMS and try again.',
      'auth/code-expired': 'This code has expired. Request a new one.',
      'auth/invalid-phone-number': 'Enter your phone number with its country code, such as +919876543210.',
      'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
      'auth/quota-exceeded': 'Phone verification is temporarily unavailable. Try Google or email sign-in.',
      'auth/network-request-failed': 'Connection lost. Check your connection and try again.',
      'auth/popup-blocked': 'Allow popups for this site to continue with Google.',
      'auth/popup-closed-by-user': 'Google sign-in was closed. You can try again.',
      'auth/account-exists-with-different-credential': 'Use your existing sign-in method for this email address.',
      'auth/operation-not-allowed': 'This sign-in method is not available yet. Try another method.',
      'auth/unauthorized-domain': 'Sign-in is not available on this website address yet.',
      'auth/captcha-check-failed': 'The security check expired. Please try sending the code again.',
    }
    return messages[error.code] || 'Sign-in could not be completed. Please try again.'
  }
  return 'Sign-in could not be completed. Check your connection and try again.'
}

export function AuthPage() {
  const { user, loading, verified, configured, refreshUser, logout } = useAuth()
  const [method, setMethod] = useState<'email' | 'phone'>('email')
  const [emailLink, setEmailLink] = useState(() => configured && isSignInWithEmailLink(configuredAuth(), window.location.href))
  const [email, setEmail] = useState(pendingEmail)
  const [phone, setPhone] = useState('+91')
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const captchaElement = useRef<HTMLDivElement>(null)
  const verifier = useRef<RecaptchaVerifier | null>(null)
  const inFlight = useRef(false)

  useEffect(() => () => verifier.current?.clear(), [])
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  useEffect(() => {
    if (verified && !emailLink && window.location.pathname !== '/studio') window.location.replace('/studio')
  }, [verified, emailLink])

  async function action(task: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try { await task() } catch (err) { setError(authMessage(err)) } finally { setBusy(false); inFlight.current = false }
  }

  function emailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!emailLink && cooldown > 0) return
    void action(async () => {
      if (emailLink) {
        await signInWithEmailLink(configuredAuth(), email.trim(), window.location.href)
        try { sessionStorage.removeItem(EMAIL_LINK_KEY) } catch { /* Optional convenience only. */ }
        window.history.replaceState({}, '', '/signin')
        setEmailLink(false)
        await refreshUser()
      } else {
        await sendSignInLinkToEmail(configuredAuth(), email.trim(), { url: `${window.location.origin}/signin`, handleCodeInApp: true })
        try { sessionStorage.setItem(EMAIL_LINK_KEY, email.trim()) } catch { /* The email can be re-entered on another device. */ }
        setNotice('Check your inbox and spam folder for your sign-in link. Open it to create your account or sign in.')
        setCooldown(60)
      }
    })
  }

  function phoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) { setError('Enter a phone number with its country code, such as +919876543210.'); return }
    if (!consent) { setError('Agree to receive the verification SMS before continuing.'); return }
    if (!confirmation && cooldown > 0) return
    void action(async () => {
      if (confirmation) {
        try { await confirmation.confirm(code); setCode('') } catch (err) {
          if (err instanceof FirebaseError && err.code === 'auth/code-expired') setConfirmation(null)
          throw err
        }
      } else {
        verifier.current?.clear()
        verifier.current = new RecaptchaVerifier(configuredAuth(), captchaElement.current!, { size: 'invisible' })
        try {
          setConfirmation(await signInWithPhoneNumber(configuredAuth(), phone, verifier.current))
          setNotice('A verification code has been sent to your phone.')
          setCooldown(60)
        } catch (err) {
          verifier.current.clear()
          verifier.current = null
          throw err
        }
      }
    })
  }

  function requestNewLink() {
    window.history.replaceState({}, '', '/signin')
    setEmailLink(false)
    setError('')
    setNotice('Enter your email to request a new sign-in link.')
  }

  if (loading) return <main className="app-shell"><SiteHeader /><div className="auth-loading" role="status">Checking your session...</div></main>

  return <main className="app-shell">
    <SiteHeader />
    <section className="auth-layout" aria-labelledby="auth-title">
      <div className="auth-intro"><p className="eyebrow">YOUR OWN CREATIVE SPACE</p><h1 id="auth-title">A studio.<br /><em>All yours.</em></h1><p>Keep your jewelry photos, image requests, and catalog creations together in your account.</p><ul><li>Your photos stay in your workspace</li><li>Return to your requests on another device</li><li>Choose Google, email, or phone sign-in</li></ul><a href="/">Explore Jewel Studio &rarr;</a></div>
      <div className="panel auth-card">
        {!configured ? <><p className="eyebrow">COMING SOON</p><h2>Account access is being prepared</h2><p>We are setting up secure sign-in. Please check back soon.</p><a className="hero-cta" href="/">Back to the studio home</a></>
          : <>
            <p className="eyebrow">WELCOME TO JEWEL STUDIO</p><h2>{emailLink ? 'Finish signing in' : 'Your account starts here'}</h2><p>{emailLink ? 'Confirm the email address that received this link. You can finish on another device too.' : 'Create an account or sign in. No password to remember.'}</p>
            {user && !verified && <p className="field-help">Your current account needs verification. Continue with an email link or use another method.</p>}
            {!emailLink && <><button className="google-signin" disabled={busy} onClick={() => void action(async () => { await signInWithPopup(configuredAuth(), new GoogleAuthProvider()) })}><span aria-hidden="true">G</span>Continue with Google</button>
              <div className="auth-divider"><span>or continue with</span></div>
              <div className="auth-tabs" role="group" aria-label="Sign-in method"><button aria-pressed={method === 'email'} disabled={busy} onClick={() => { setMethod('email'); setError(''); setNotice('') }}>Email</button><button aria-pressed={method === 'phone'} disabled={busy} onClick={() => { setMethod('phone'); setError(''); setNotice('') }}>Phone number</button></div></>}
            {method === 'email' || emailLink ? <form className="auth-form" onSubmit={emailSubmit}>
              <label>Email address<input required type="email" autoComplete="email" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>
              <button className="primary-button" disabled={busy || (!emailLink && cooldown > 0)}>{busy ? 'Please wait...' : emailLink ? 'Complete sign-in' : cooldown > 0 ? `Send again in ${cooldown}s` : 'Email me a sign-in link'}</button>
              <small>{emailLink ? 'Use the same email address you entered when requesting this link.' : 'The link verifies your email and opens your account securely.'}</small>
              {emailLink && <button type="button" className="text-button" disabled={busy} onClick={requestNewLink}>Request a new link</button>}
            </form> : <form className="auth-form" onSubmit={phoneSubmit}>
              <label>Phone number<input required type="tel" autoComplete="tel" value={phone} placeholder="+919876543210" disabled={busy || !!confirmation} onChange={event => setPhone(event.target.value.replace(/[\s()-]/g, ''))} /></label>
              {confirmation ? <><label>Verification code<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label><button className="primary-button" disabled={busy}>{busy ? 'Verifying...' : 'Verify & sign in'}</button><button type="button" className="text-button" disabled={busy || cooldown > 0} onClick={() => { setConfirmation(null); setCode(''); setNotice('Request a new code below.') }}>{cooldown > 0 ? `New code available in ${cooldown}s` : 'Request a new code or change number'}</button></>
                : <><label className="sms-consent"><input required type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>I agree to receive a sign-in code by SMS. My number is sent to Google for sign-in and abuse prevention. Message rates may apply.</span></label><button className="primary-button" disabled={busy || cooldown > 0}>{busy ? 'Sending code...' : cooldown > 0 ? `Send again in ${cooldown}s` : 'Send verification code'}</button></>}
            </form>}
            {user && <button className="text-button" disabled={busy} onClick={() => void action(logout)}>Use a different account</button>}
          </>}
        <div ref={captchaElement} />
        {error && <p className="error-message" role="alert">{error}</p>}
        {notice && <p className="auth-feedback" role="status">{notice}</p>}
      </div>
    </section>
    <SiteFooter />
  </main>
}
