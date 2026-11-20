import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { onIdTokenChanged, signOut, type User } from 'firebase/auth'
import { apiFetch } from './api'
import { firebaseAuth, authConfigured } from './firebase'

export type Profile = { uid: string; name: string; business: string; email: string; phone: string; email_verified: boolean }
type AuthState = {
  user: User | null; loading: boolean; verified: boolean; configured: boolean
  profile: Profile | null; profileError: string
  refreshUser: () => Promise<void>
  updateProfile: (name: string, business: string) => Promise<void>
  logout: () => Promise<void>
}
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; loading: boolean; revision: number }>({ user: null, loading: authConfigured, revision: 0 })
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    if (!firebaseAuth) return
    return onIdTokenChanged(firebaseAuth, user => {
      setSession(current => ({ user, loading: false, revision: current.revision + 1 }))
    }, () => {
      setSession(current => ({ user: null, loading: false, revision: current.revision + 1 }))
    })
  }, [])

  useEffect(() => {
    setProfile(null)
    setProfileError('')
    if (!session.user) return
    const controller = new AbortController()
    void apiFetch('/me', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Your profile could not be loaded. Please try again.')
      const value = await response.json() as Profile
      if (!controller.signal.aborted) setProfile(value)
    }).catch(() => {
      if (!controller.signal.aborted) setProfileError('Your profile could not be loaded. Please try again.')
    })
    return () => controller.abort()
  }, [session.user?.uid, session.revision])

  async function refreshUser() {
    const user = firebaseAuth?.currentUser
    if (!user) return
    await user.reload()
    await user.getIdToken(true)
    setSession(current => ({ user, loading: false, revision: current.revision + 1 }))
  }

  async function updateProfile(name: string, business: string) {
    const response = await apiFetch('/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, business }) })
    if (!response.ok) throw new Error('Your profile could not be saved. Please try again.')
    const value = await response.json() as Profile
    if (value.uid === firebaseAuth?.currentUser?.uid) setProfile(value)
  }

  async function logout() {
    if (firebaseAuth) await signOut(firebaseAuth)
    setProfile(null)
    window.location.assign('/')
  }

  const user = session.user
  return <AuthContext.Provider value={{
    user, loading: session.loading, verified: Boolean(user && (user.emailVerified || user.phoneNumber)),
    configured: authConfigured, profile: profile?.uid === user?.uid ? profile : null, profileError,
    refreshUser, updateProfile, logout,
  }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is required.')
  return context
}
