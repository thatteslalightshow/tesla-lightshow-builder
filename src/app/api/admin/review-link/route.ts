import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// Admin-only: approve or deny a flagged community link that's sitting in the holding pattern.
// approve → 'approved' (the link goes live on the show/gallery) · deny → 'rejected' (stays hidden).
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = getAdminClient()
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!prof?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { show_id?: string; action?: 'approve' | 'deny' }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (!body.show_id || (body.action !== 'approve' && body.action !== 'deny')) {
    return NextResponse.json({ error: 'Missing show_id or action' }, { status: 400 })
  }
  const status = body.action === 'approve' ? 'approved' : 'rejected'
  const { error } = await admin.from('shows')
    .update({ social_status: status, social_flag_reason: status === 'approved' ? null : 'Denied in review.' })
    .eq('id', body.show_id)
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
