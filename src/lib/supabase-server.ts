import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cookie-session Supabase client for Route Handlers — the @supabase/ssr replacement for the
// deprecated createRouteHandlerClient({ cookies }) (auth-helpers), removed with the Next 16
// upgrade (cookies() is async-only now). Await it once per request:
//
//   const supabase = await createRouteClient()
//   const { data: { user } } = await supabase.auth.getUser()
export async function createRouteClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // Refreshed tokens get written back when possible; some contexts are read-only,
          // which is fine — the browser client refreshes on its own.
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* read-only context */ }
        },
      },
    },
  )
}
