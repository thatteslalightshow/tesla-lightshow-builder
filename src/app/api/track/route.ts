import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { rateLimitOk } from '@/lib/rate-limit'

// First-party, privacy-friendly page-view ingest. No raw IP (consistent with
// api/geo/track) — only a coarse country/region from Vercel edge headers and a
// client-generated anonymous id. Best-effort: never errors the caller.
//
// PUBLIC route (anonymous visitors are exactly who it must count), so it validates
// its input strictly and rate-limits per anon id: the id must be the client UUID
// from Track.tsx (or its literal 'anon' fallback when localStorage is blocked),
// and `type` a plain snake_case token — anything else is dropped without a write.
const ANON_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|anon)$/i
const TYPE = /^[a-z_]{1,40}$/

export async function POST(req: Request) {
  let body: { type?: string; path?: string; anon_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const type = typeof body.type === 'string' && TYPE.test(body.type) ? body.type : 'page_view'
  const path = typeof body.path === 'string' && body.path.startsWith('/') ? body.path.slice(0, 512) : null
  const anon = typeof body.anon_id === 'string' && ANON_ID.test(body.anon_id) ? body.anon_id : null
  if (!anon) return NextResponse.json({ ok: false }, { status: 400 })
  const country = req.headers.get('x-vercel-ip-country')
  const region = req.headers.get('x-vercel-ip-country-region')

  const admin = getAdminClient()
  // Per-anon-id cap — stops a naive flood from bloating the events table. The shared
  // limiter FAILS OPEN (including for the literal 'anon' id if check_rate's param
  // type rejects it), which is the right bias for best-effort analytics.
  if (!(await rateLimitOk(admin, anon, 'track', 300))) {
    return NextResponse.json({ ok: false }, { status: 429 })
  }
  await admin.from('events').insert({ type, path, anon_id: anon, country, region }).then(() => null, () => null)
  return NextResponse.json({ ok: true })
}
