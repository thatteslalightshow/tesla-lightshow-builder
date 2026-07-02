import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { getAdminClient } from '@/lib/supabase'

// Redeem a gift code → bank one (or more) export credits on the signed-in account. Money-path, so it's
// server-authoritative and race-safe: the code is CLAIMED with a conditional update (can't be redeemed
// twice), and the balance is incremented with compare-and-set (can't clobber a concurrent export spend).
export async function POST(req: Request) {
  const supabase = await createRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in to redeem a gift.' }, { status: 401 })

  let body: { code?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const code = (body.code ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Enter your gift code.' }, { status: 400 })

  const admin = getAdminClient()
  const { data: gift } = await admin.from('gift_codes').select('id, credits, redeemed_by').eq('code', code).limit(1)
  const row = gift?.[0]
  if (!row) return NextResponse.json({ error: "That code isn't valid — double-check it and try again." }, { status: 404 })
  if (row.redeemed_by) return NextResponse.json({ error: 'That gift has already been redeemed.' }, { status: 409 })

  // Claim the code only if still unredeemed → wins the race against a second redeem.
  const { data: claimed } = await admin.from('gift_codes')
    .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq('id', row.id).is('redeemed_by', null)
    .select('id')
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'That gift has already been redeemed.' }, { status: 409 })
  }

  // Bank the credits with compare-and-set (so a concurrent export spend can't be lost).
  const credits = Math.max(1, row.credits ?? 1)
  let credited = false
  for (let attempt = 0; attempt < 5 && !credited; attempt++) {
    const { data: prof } = await admin.from('profiles').select('gift_credits').eq('id', user.id).limit(1)
    const current = (prof?.[0] as { gift_credits?: number } | undefined)?.gift_credits ?? 0
    const { data: upd } = await admin.from('profiles')
      .update({ gift_credits: current + credits })
      .eq('id', user.id).eq('gift_credits', current)
      .select('id')
    if (upd && upd.length > 0) credited = true
  }
  if (!credited) {
    // Couldn't bank the credit → release the claim so the gift isn't silently consumed.
    await admin.from('gift_codes').update({ redeemed_by: null, redeemed_at: null }).eq('id', row.id)
    return NextResponse.json({ error: 'Could not apply your gift — please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, credits })
}
