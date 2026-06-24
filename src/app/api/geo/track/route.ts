import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// Records the caller's COARSE location (country + region) from Vercel's edge geo
// headers onto their profile — once, and never overwritten. We deliberately do
// NOT store raw IP addresses (PII). No-op when geo headers are absent (local/dev
// or non-Vercel hosts).
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const country = req.headers.get('x-vercel-ip-country')
  const region = req.headers.get('x-vercel-ip-country-region')
  if (!country) return NextResponse.json({ ok: true })   // no geo available — nothing to record

  const admin = getAdminClient()
  const { data: profile } = await admin.from('profiles').select('country').eq('id', user.id).maybeSingle()
  if (profile && !profile.country) {
    await admin.from('profiles').update({ country, region }).eq('id', user.id).then(() => null, () => null)
  }
  return NextResponse.json({ ok: true })
}
