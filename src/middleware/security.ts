import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SECURITY_HEADERS = {
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    // Prod only needs 'wasm-unsafe-eval' (the audio decoder's WASM) — not blanket eval. Dev/HMR
    // still needs 'unsafe-eval' for Fast Refresh. ('unsafe-inline' stays until inline scripts are
    // nonce'd — a separate, larger change.) The clip-moderation TF.js libs + weights are
    // self-hosted under /public (see clip-moderation.ts), so no external script/connect hosts.
    `script-src 'self' ${process.env.NODE_ENV === 'production' ? "'wasm-unsafe-eval'" : "'unsafe-eval'"} 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: https://*.supabase.co",
    // *.ingest.us.sentry.io: browser-side Sentry error reports, once NEXT_PUBLIC_SENTRY_DSN is
    // set (the old CSP silently blocked them — US region per the org's API host).
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co blob: https://*.ingest.us.sentry.io",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; '),
}

// Routes that authenticate themselves (signature / token) and must NOT be
// gated by the cookie-session check in middleware.
const PUBLIC_API_ROUTES = new Set([
  '/api/stripe/webhook',     // verified via Stripe signature
  '/api/shows/view',         // anonymous view counter (increment-only)
  '/api/stats',              // public homepage counter (aggregate counts, no PII)
  '/api/gift/checkout',      // anyone can buy a gift (no account needed); Stripe collects the buyer email
  '/api/email/unsubscribe',  // clicked from email clients (no session); verified via HMAC token
  '/api/community/videos',   // homepage "real Teslas" strip — public, admin-approved rows only
  '/api/track',              // anonymous page-view ingest; validated + rate-limited in the route
])

// Next 16: the `middleware` convention is deprecated in favor of `proxy` (nodejs runtime).
// Re-exported from src/proxy.ts.
export async function proxy(req: NextRequest) {
  const res = NextResponse.next()
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.headers.set(k, v))

  const origin = req.headers.get('origin') || ''
  const host = req.headers.get('host') || ''
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || '',
    'http://localhost:3000',
    'capacitor://localhost',
    'http://localhost',
  ].filter(Boolean)

  // A page calling its own API is same-origin and always allowed. This covers
  // production, Vercel preview deployments, and custom domains without pinning
  // every URL in the allowlist (which only needs explicit cross-origin callers
  // like the Capacitor mobile shell). Without this, a mismatch between the
  // visited URL and NEXT_PUBLIC_APP_URL 403s every same-origin /api request.
  let sameOrigin = false
  try { sameOrigin = !!origin && new URL(origin).host === host } catch { sameOrigin = false }
  const originAllowed = sameOrigin || allowedOrigins.includes(origin)

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': originAllowed ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  if (req.nextUrl.pathname.startsWith('/api/')) {
    if (origin && !originAllowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Self-authenticating routes (e.g. Stripe webhook) skip the session gate.
    if (PUBLIC_API_ROUTES.has(req.nextUrl.pathname)) {
      return res
    }

    // Two accepted transports:
    //   • Bearer token  → mobile app; the route handler validates it.
    //   • Cookie session → web app; validated here.
    const authHeader = req.headers.get('authorization')
    const hasBearer = !!authHeader?.toLowerCase().startsWith('bearer ')

    // Cookie sessions are validated here; bearer (mobile) tokens are validated by the route handler.
    // Per-user RATE LIMITING now lives in the route handlers (shared Supabase `check_rate`) — the old
    // in-memory limiter was per serverless instance, reset on cold start, and easy to evade.
    // getSession() (local cookie check) is deliberate: this gate only needs "a session exists" —
    // the route handlers do the authoritative getUser() revalidation.
    if (!hasBearer) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => req.cookies.getAll(),
            setAll: (toSet) => toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
          },
        },
      )
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
  }
  return res
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
