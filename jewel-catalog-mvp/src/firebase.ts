import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const authConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)
export const firebaseAuth: Auth | null = authConfigured ? getAuth(initializeApp(config)) : null

if (firebaseAuth && import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
  connectAuthEmulator(firebaseAuth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL)
  firebaseAuth.settings.appVerificationDisabledForTesting = true
}

export function configuredAuth(): Auth {
  if (!firebaseAuth) throw new Error('Account access is being configured. Please try again later.')
  return firebaseAuth
}
