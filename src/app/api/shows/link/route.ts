import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'
import { parseSocialLink } from '@/lib/social-link'

// Attach (or clear) the creator's social-post link on THEIR show. Owner-only; the URL is re-validated
// against the allowlist server-side. The client runs the on-device thumbnail check and reports the
// outcome: a CLEAN result → 'approved' (link goes live); a FLAGGED result → 'pending' (HELD, not shown on
// the site) with a reason, which surfaces in the admin review queue for approve/deny.
// POST { show_id, url, status?, reason?, thumb_url? }  ·  url:null clears the link.
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  let body: { show_id?: string; url?: string | null; status?: string; reason?: string | null; thumb_url?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id.' }, { status: 400 })

  const admin = getAdminClient()
  const { data: show } = await admin.from('shows').select('user_id').eq('id', body.show_id).maybeSingle()
  if (!show) return NextResponse.json({ error: 'Show not found.' }, { status: 404 })
  if (show.user_id !== user.id) return NextResponse.json({ error: "That isn't your show." }, { status: 403 })

  if (!body.url) {
    await admin.from('shows').update({ social_url: null, social_status: null, social_flag_reason: null, social_thumb_url: null }).eq('id', body.show_id)
    return NextResponse.json({ ok: true, status: null })
  }
  const link = parseSocialLink(body.url)
  if (!link) return NextResponse.json({ error: 'Only public TikTok or YouTube links are allowed.' }, { status: 400 })

  // A clean on-device check auto-approves; anything else is held for admin review.
  const status = body.status === 'approved' ? 'approved' : 'pending'
  const { error } = await admin.from('shows').update({
    social_url: link.url,
    social_status: status,
    social_flag_reason: status === 'pending' ? (body.reason || 'Flagged by the automatic check.') : null,
    social_thumb_url: typeof body.thumb_url === 'string' ? body.thumb_url.slice(0, 2000) : null,
    social_submitted_at: new Date().toISOString(),
  }).eq('id', body.show_id)
  if (error) return NextResponse.json({ error: 'Could not save the link.' }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
