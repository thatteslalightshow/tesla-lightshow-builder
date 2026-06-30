import { NextResponse } from 'next/server'
import { getAdminClient, type TeslaModel } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'
import { cloneCommunityShow } from '@/lib/community'
import { MODELS } from '@/lib/tesla-channels'

// Add a community show to the buyer's library, tailored to their model.
// Free for admins + subscribers (and for shows they already own — a free model
// switch). Everyone else gets { needs_payment: true } → /api/community/checkout.
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id?: string; tesla_model?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const sourceId = body.show_id
  const model = body.tesla_model as TeslaModel
  if (!sourceId) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })
  if (!model || !MODELS[model]) return NextResponse.json({ error: 'Pick a Tesla model' }, { status: 400 })

  const admin = getAdminClient()

  // Already in their library? Return it (free re-acquire — e.g. switching model).
  const { data: existing } = await admin
    .from('shows').select('id').eq('user_id', user.id).eq('source_show_id', sourceId).limit(1).maybeSingle()
  if (existing) return NextResponse.json({ show_id: existing.id, already: true })

  // Free for admins, testers + active subscribers; otherwise it needs the $2.99 purchase.
  const [{ data: profile }, { data: subscription }] = await Promise.all([
    admin.from('profiles').select('is_admin').eq('id', user.id).single(),
    admin.from('subscriptions').select('status').eq('user_id', user.id).in('status', ['active', 'trialing']).limit(1),
  ])
  // is_tester read separately so a missing column (pre-migration) can't break this.
  const { data: testerRow } = await admin.from('profiles').select('is_tester').eq('id', user.id).maybeSingle()
  const isPrivileged = profile?.is_admin === true || (testerRow as { is_tester?: boolean } | null)?.is_tester === true
  const isSubscribed = ((subscription as unknown[] | null)?.length ?? 0) > 0   // .limit(1): tolerate duplicate active subs
  if (!(isPrivileged || isSubscribed)) {
    return NextResponse.json({ needs_payment: true })
  }

  const result = await cloneCommunityShow(sourceId, user.id, model)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ show_id: result.showId })
}
