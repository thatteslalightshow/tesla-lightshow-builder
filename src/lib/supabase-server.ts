import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-side Supabase client (@supabase/ssr) for Route Handlers and Server
// Components. Reads the session from request cookies and (in contexts that
// allow it) writes refreshed auth cookies back.
//
// NOTE: on Next 14 `cookies()` is synchronous. When the app moves to Next 15+
// it becomes async — the @next/codemod upgrade handles that change.
export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component, where setting cookies is not
            // allowed. Safe to ignore — the middleware refreshes the session
            // and writes the cookies on the next request.
          }
        },
      },
    }
  )
}
