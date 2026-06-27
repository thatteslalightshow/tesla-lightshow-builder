import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'

// First-party, privacy-friendly page-view ingest. No raw IP (consistent with
// api/geo/track) — only a coarse country/region from Vercel edge headers and a
// client-generated anonymous id. Best-effort: never errors the caller.
export async function POST(req: Request) {
  let body: { type?: string; path?: string; anon_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const type = typeof body.type === 'string' ? body.type.slice(0, 40) : 'page_view'
  const path = typeof body.path === 'string' ? body.path.slice(0, 512) : null
  const anon = typeof body.anon_id === 'string' ? body.anon_id.slice(0, 64) : null
  const country = req.headers.get('x-vercel-ip-country')
  const region = req.headers.get('x-vercel-ip-country-region')

  const admin = getAdminClient()
  await admin.from('events').insert({ type, path, anon_id: anon, country, region }).then(() => null, () => null)
  return NextResponse.json({ ok: true })
}
