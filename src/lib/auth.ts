import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getAdminClient } from './supabase'

export interface AuthedUser {
  id: string
  email: string | null
}

/**
 * Resolve the authenticated user from a request.
 *
 * Supports two auth transports so the same API routes serve both clients:
 *   1. Bearer token in the Authorization header  → mobile app (Expo)
 *   2. Cookie-based session                       → web app (Next.js)
 *
 * Returns null when neither produces a valid user.
 */
export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  // 1. Bearer token (mobile)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) {
      const admin = getAdminClient()
      const { data, error } = await admin.auth.getUser(token)
      if (!error && data.user) {
        return { id: data.user.id, email: data.user.email ?? null }
      }
    }
  }

  // 2. Cookie session (web)
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    return { id: session.user.id, email: session.user.email ?? null }
  }

  return null
}
