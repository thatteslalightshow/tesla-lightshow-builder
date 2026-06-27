import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'
import { sendBroadcast } from '@/lib/email'
import { unsubToken, appUrl } from '@/lib/reengage'

export const maxDuration = 60
const MAX_RECIPIENTS = 5000

type Audience = 'all' | 'subscribers' | 'non_subscribers'

// Owner-authored body → safe HTML: escape, linkify URLs, newlines → <br>.
function formatBody(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#e8404a;">${u}</a>`)
  return `<p style="font-size:15px;color:rgba(255,255,255,0.65);margin:0 0 22px;line-height:1.7;">${linked.replace(/\n/g, '<br/>')}</p>`
}

async function requireAdmin(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return { error: 'Unauthorized' as const, status: 401 as const }
  const admin = getAdminClient()
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!prof?.is_admin) return { error: 'Forbidden' as const, status: 403 as const }
  return { user, admin }
}

// Admin-only broadcast: mode 'proof' sends only to the admin (for review); mode 'send'
// emails the chosen audience minus anyone who opted out. Featured/community-show content
// only ever goes out through this approved path.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, admin } = auth

  let body: { mode?: 'proof' | 'send'; subject?: string; body?: string; audience?: Audience }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const subject = (body.subject ?? '').trim()
  const message = (body.body ?? '').trim()
  const audience: Audience = body.audience === 'subscribers' || body.audience === 'non_subscribers' ? body.audience : 'all'
  if (!subject || !message) return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 })

  const base = appUrl()
  const bodyHtml = formatBody(message)
  const unsub = (uid: string) => `${base}/api/email/unsubscribe?u=${uid}&t=${unsubToken(uid)}`

  // PROOF → only the admin themselves.
  if (body.mode === 'proof') {
    if (!user.email) return NextResponse.json({ error: 'Your account has no email on file' }, { status: 400 })
    const ok = await sendBroadcast({ to: user.email, subject: `[PROOF] ${subject}`, bodyHtml, unsubscribeUrl: unsub(user.id) })
    return NextResponse.json({ ok, mode: 'proof', recipients: ok ? 1 : 0 })
  }

  // SEND → the chosen audience, minus opted-out. Emails come from auth (paginated).
  const users: { id: string; email: string }[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) break
    for (const u of data.users) if (u.email) users.push({ id: u.id, email: u.email })
    if (data.users.length < 1000) break
  }
  const ids = users.map(u => u.id)
  const [{ data: optRows }, { data: subRows }] = await Promise.all([
    admin.from('profiles').select('id').eq('marketing_opt_out', true).in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    admin.from('subscriptions').select('user_id').in('status', ['active', 'trialing']),
  ])
  const optedOut = new Set((optRows ?? []).map(r => (r as { id: string }).id))
  const subscribers = new Set((subRows ?? []).map(r => (r as { user_id: string }).user_id))

  const recipients = users.filter(u => {
    if (optedOut.has(u.id)) return false
    if (audience === 'subscribers') return subscribers.has(u.id)
    if (audience === 'non_subscribers') return !subscribers.has(u.id)
    return true
  }).slice(0, MAX_RECIPIENTS)

  let sent = 0
  for (const r of recipients) {
    if (await sendBroadcast({ to: r.email, subject, bodyHtml, unsubscribeUrl: unsub(r.id) })) sent++
  }

  await admin.from('broadcasts').insert({ subject, body: message, audience, recipients: sent, created_by: user.id }).then(() => null, () => null)
  return NextResponse.json({ ok: true, mode: 'send', recipients: sent, audience })
}
