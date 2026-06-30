import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// Free-tier cloud library cap. Subscribers (and admins/testers) get unlimited; free
// users can keep this many SAVED shows. Hitting it never deletes anything — it just
// blocks the next NEW save and nudges an upgrade. Adjustable.
const FREE_SHOW_CAP = 1

// New-show creation. Routed through the server so the cloud-library cap is enforced
// where it can't be bypassed (updates to existing shows stay client-side via RLS).
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const admin = getAdminClient()

  // Privilege + current library size in one round-trip.
  const [{ data: profile }, { data: subscription }, { count: showCount }] = await Promise.all([
    admin.from('profiles').select('is_admin').eq('id', user.id).single(),
    admin.from('subscriptions').select('status').eq('user_id', user.id).in('status', ['active', 'trialing']).limit(1),
    admin.from('shows').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])
  const { data: testerRow } = await admin.from('profiles').select('is_tester').eq('id', user.id).maybeSingle()
  const isPrivileged = profile?.is_admin === true
    || (testerRow as { is_tester?: boolean } | null)?.is_tester === true
    || ((subscription as unknown[] | null)?.length ?? 0) > 0   // .limit(1): tolerate duplicate active subs

  if (!isPrivileged && (showCount ?? 0) >= FREE_SHOW_CAP) {
    return NextResponse.json({ error: 'cap_reached', cap: FREE_SHOW_CAP }, { status: 403 })
  }

  // Build the row from client fields, but force server-trusted user_id + defaults.
  const allowed = ['name', 'tesla_model', 'style', 'intensity', 'bpm', 'song_title', 'song_artist', 'edit_data', 'duration_sec'] as const
  const row: Record<string, unknown> = { user_id: user.id, is_public: false, share_token: crypto.randomUUID(), updated_at: new Date().toISOString() }
  for (const k of allowed) if (body[k] !== undefined) row[k] = body[k]

  // Insert; if edit_data column isn't there yet (migration not run), retry without it.
  let ins = await admin.from('shows').insert(row).select('id, share_token').single()
  if (ins.error && /edit_data/.test(ins.error.message)) {
    const { edit_data: _omit, ...noEdit } = row; void _omit
    ins = await admin.from('shows').insert(noEdit).select('id, share_token').single()
  }
  if (ins.error || !ins.data) {
    return NextResponse.json({ error: ins.error?.message ?? 'Could not create show' }, { status: 500 })
  }
  return NextResponse.json({ id: ins.data.id, share_token: ins.data.share_token })
}
