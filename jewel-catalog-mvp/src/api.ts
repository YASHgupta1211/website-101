import { firebaseAuth } from './firebase'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const user = firebaseAuth?.currentUser
  if (!user) throw new Error('Sign in to continue.')
  async function request(refresh = false) {
    const token = await user!.getIdToken(refresh)
    if (firebaseAuth?.currentUser?.uid !== user!.uid) throw new Error('Your account changed. Please reload the page.')
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'omit', cache: 'no-store' })
  }
  let response = await request()
  if (response.status === 401) response = await request(true)
  return response
}
