import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
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
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co blob:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; '),
}

const RATE_LIMITS: Record<string, number> = {
  '/api/upload':   10,
  '/api/generate': 20,
  '/api/export':   10,
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function edgeRateLimit(key: string, max: number): boolean {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.headers.set(k, v))

  const origin = req.headers.get('origin') || ''
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || '',
    'http://localhost:3000',
    'capacitor://localhost',
    'http://localhost',
  ].filter(Boolean)

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Server-side auth gate for protected pages (prevents unauthenticated SSR)
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/builder') || pathname.startsWith('/dashboard')) {
    const supabaseAuth = createMiddlewareClient({ req, res })
    const { data: { session } } = await supabaseAuth.auth.getSession()
    if (!session) {
      return NextResponse.redirect(new URL('/auth', req.url))
    }
  }

  if (pathname.startsWith('/api/')) {
    if (origin && !allowedOrigins.includes(origin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const supabase = createMiddlewareClient({ req, res })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const routeLimit = RATE_LIMITS[req.nextUrl.pathname]
    if (routeLimit) {
      const key = `${session.user.id}:${req.nextUrl.pathname}`
      if (!edgeRateLimit(key, routeLimit)) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Try again in an hour.' },
          { status: 429, headers: { 'Retry-After': '3600' } }
        )
      }
    }
  }
  return res
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
