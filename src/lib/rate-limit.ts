import type { SupabaseClient } from '@supabase/supabase-js'

// Shared, cross-instance rate limit backed by Supabase (the `check_rate` SQL function). Replaces the
// per-serverless-instance in-memory limiter, which reset on cold start and could be evaded by
// spreading requests across instances. Returns true if ALLOWED, false if the user is over `max` for
// `action` within the window. FAILS OPEN on any DB hiccup — never block a legit user over a limiter error.
export async function rateLimitOk(
  admin: SupabaseClient,
  userId: string,
  action: string,
  max: number,
  windowSeconds = 3600,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('check_rate', {
      p_user: userId, p_action: action, p_max: max, p_window_seconds: windowSeconds,
    })
    if (error) return true        // fail open
    return data !== false
  } catch {
    return true                   // fail open
  }
}
