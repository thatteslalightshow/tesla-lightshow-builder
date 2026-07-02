import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

// OAuth (Google) + magic-link landing. Supabase redirects here with a one-time
// `code` after the user authenticates; we exchange it for a session cookie and
// send them on to the app. Errors (e.g. the user cancels Google) bounce back to
// /auth with a message.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error_description') || url.searchParams.get('error')
  const next = url.searchParams.get('next') || '/dashboard'

  if (error) {
    return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(error)}`, url.origin))
  }

  if (code) {
    const supabase = await createRouteClient()
    const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeErr) {
      return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(exchangeErr.message)}`, url.origin))
    }
    return NextResponse.redirect(new URL(next, url.origin))
  }

  // No code and no error — nothing to do; send them to sign in.
  return NextResponse.redirect(new URL('/auth', url.origin))
}
