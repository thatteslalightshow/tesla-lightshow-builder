import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { sendReengagement, sendWelcome, sendCreatorWelcome, sendFirstExportCheers, sendWinBack, sendRenewalReminder } from '@/lib/email'
import { unsubToken, appUrl } from '@/lib/reengage'

export const maxDuration = 60

const H = 3600000, D = 86400000
const MAX_PER_RUN = 200
const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S', modelX: 'Model X', cybertruck: 'Cybertruck',
}

type Cand = { id: string; user_id: string; name: string | null; tesla_model: string; song_title: string | null }
type Prof = { id: string; is_admin: boolean | null; is_tester: boolean | null; marketing_opt_out: boolean | null }
type Admin = ReturnType<typeof getAdminClient>

// Daily customer-email cron (CRON_SECRET-guarded). Runs BOTH:
//  - abandoned-show re-engagement (two-touch, non-subscribers) — runReengage
//  - lifecycle: welcome / creator-welcome / first-export — runLifecycle
// One cron path so we don't add a third Vercel cron job. Each job is independent and
// defensive (a missing table/column never breaks the other).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = getAdminClient()
  const reengage = await runReengage(admin).catch(e => ({ error: String(e?.message ?? e) }))
  const lifecycle = await runLifecycle(admin).catch(e => ({ error: String(e?.message ?? e) }))
  const retention = await runRetention(admin).catch(e => ({ error: String(e?.message ?? e) }))
  return NextResponse.json({ ok: true, reengage, lifecycle, retention })
}

// ── Abandoned-show re-engagement (two-touch) ────────────────────────────────
async function runReengage(admin: Admin) {
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const sel = 'id, user_id, name, tesla_model, song_title'

  let t1: Cand[] = [], t2: Cand[] = []
  try {
    const [a, b] = await Promise.all([
      admin.from('shows').select(sel)
        .lte('created_at', iso(now - 48 * H)).gte('created_at', iso(now - 96 * H))
        .is('reengage_48_at', null).limit(MAX_PER_RUN),
      admin.from('shows').select(sel)
        .lte('created_at', iso(now - 5 * D)).gte('created_at', iso(now - 10 * D))
        .is('reengage_5d_at', null).not('reengage_48_at', 'is', null).limit(MAX_PER_RUN),
    ])
    t1 = (a.data ?? []) as Cand[]
    t2 = (b.data ?? []) as Cand[]
  } catch {
    return { sent: 0, skipped: 'reengage columns not migrated' }
  }

  const all = [...t1, ...t2]
  if (all.length === 0) return { sent: 0 }

  const showIds = [...new Set(all.map(s => s.id))]
  const userIds = [...new Set(all.map(s => s.user_id))]
  const [{ data: exportsRows }, { data: subs }, { data: profs }] = await Promise.all([
    admin.from('exports').select('show_id').in('show_id', showIds),
    admin.from('subscriptions').select('user_id').in('user_id', userIds).in('status', ['active', 'trialing']),
    admin.from('profiles').select('id, is_admin, is_tester, marketing_opt_out').in('id', userIds),
  ])
  const exported = new Set((exportsRows ?? []).map(r => r.show_id))
  const subscriber = new Set((subs ?? []).map(r => r.user_id))
  const profMap = new Map((profs ?? []).map((p) => [(p as Prof).id, p as Prof]))

  const eligible = (s: Cand) => {
    if (exported.has(s.id) || subscriber.has(s.user_id)) return false
    const p = profMap.get(s.user_id)
    return !(p?.is_admin || p?.is_tester || p?.marketing_opt_out)
  }

  const base = appUrl()
  const emailCache = new Map<string, string | null>()
  const getEmail = async (uid: string) => {
    if (emailCache.has(uid)) return emailCache.get(uid)!
    const { data } = await admin.auth.admin.getUserById(uid)
    const e = data?.user?.email ?? null
    emailCache.set(uid, e); return e
  }

  let sent = 0
  const run = async (cands: Cand[], touch: 'first' | 'final', stampCol: 'reengage_48_at' | 'reengage_5d_at') => {
    for (const s of cands) {
      if (sent >= MAX_PER_RUN || !eligible(s)) continue
      const email = await getEmail(s.user_id)
      if (!email) continue
      try {
        await sendReengagement({
          to: email,
          showName: s.name || 'your light show',
          model: MODEL_LABELS[s.tesla_model] ?? 'Tesla',
          builderUrl: `${base}/builder?id=${s.id}`,
          unsubscribeUrl: `${base}/api/email/unsubscribe?u=${s.user_id}&t=${unsubToken(s.user_id)}`,
          songTitle: s.song_title ?? undefined,
          touch,
        })
        await admin.from('shows').update({ [stampCol]: new Date().toISOString() }).eq('id', s.id)
        sent++
      } catch { /* leave unstamped → retried next run */ }
    }
  }
  await run(t1, 'first', 'reengage_48_at')
  await run(t2, 'final', 'reengage_5d_at')
  return { sent, candidates: all.length }
}

// ── Lifecycle: welcome / creator-welcome / first-export (each once per user) ──
async function runLifecycle(admin: Admin) {
  const cut = new Date(Date.now() - 3 * D).toISOString()
  const base = appUrl()

  let newProfiles: { id: string }[] = []
  let newSubs: { user_id: string }[] = []
  let recentExports: { user_id: string; show_id: string }[] = []
  try {
    const [p, s, e] = await Promise.all([
      admin.from('profiles').select('id').gte('created_at', cut).limit(500),
      admin.from('subscriptions').select('user_id').in('status', ['active', 'trialing']).gte('created_at', cut).limit(500),
      admin.from('exports').select('user_id, show_id').gte('created_at', cut).limit(1000),
    ])
    newProfiles = (p.data ?? []) as { id: string }[]
    newSubs = (s.data ?? []) as { user_id: string }[]
    recentExports = (e.data ?? []) as { user_id: string; show_id: string }[]
  } catch {
    return { sent: 0, skipped: 'lifecycle source tables missing' }
  }

  const userIds = [...new Set([...newProfiles.map(p => p.id), ...newSubs.map(s => s.user_id), ...recentExports.map(x => x.user_id)])]
  if (userIds.length === 0) return { sent: 0 }

  // Dedup via email_log (one row per user+kind). Missing table → skip lifecycle.
  let logs: { user_id: string; kind: string }[] = []
  try {
    logs = ((await admin.from('email_log').select('user_id, kind').in('user_id', userIds)).data ?? []) as { user_id: string; kind: string }[]
  } catch {
    return { sent: 0, skipped: 'email_log not migrated' }
  }
  const logged = new Set(logs.map(l => `${l.user_id}|${l.kind}`))

  const exportShowIds = [...new Set(recentExports.map(x => x.show_id))]
  const [{ data: profs }, { data: shows }] = await Promise.all([
    admin.from('profiles').select('id, marketing_opt_out, is_admin, is_tester').in('id', userIds),
    admin.from('shows').select('id, user_id, name').in('id', exportShowIds.length ? exportShowIds : ['00000000-0000-0000-0000-000000000000']),
  ])
  // Skip opted-out AND admin/tester accounts — we don't email ourselves while testing.
  const skip = new Set((profs ?? []).filter((p) => { const x = p as { marketing_opt_out?: boolean; is_admin?: boolean; is_tester?: boolean }; return x.marketing_opt_out || x.is_admin || x.is_tester }).map((p) => (p as { id: string }).id))
  const hasShow = new Set((shows ?? []).map((r) => (r as { user_id: string }).user_id))   // users who own an exported show
  const showName = new Map((shows ?? []).map((r) => [(r as { id: string }).id, (r as { name: string | null }).name]))

  const emailCache = new Map<string, string | null>()
  const getEmail = async (uid: string) => {
    if (emailCache.has(uid)) return emailCache.get(uid)!
    const { data } = await admin.auth.admin.getUserById(uid)
    const e = data?.user?.email ?? null
    emailCache.set(uid, e); return e
  }
  const unsub = (uid: string) => `${base}/api/email/unsubscribe?u=${uid}&t=${unsubToken(uid)}`

  let sent = 0
  const send = async (uid: string, kind: string, fn: (email: string) => Promise<void>) => {
    if (logged.has(`${uid}|${kind}`) || skip.has(uid)) return
    const email = await getEmail(uid)
    if (!email) return
    try {
      await fn(email)
      await admin.from('email_log').insert({ user_id: uid, kind }).then(() => null, () => null)
      logged.add(`${uid}|${kind}`)
      sent++
    } catch { /* leave unlogged → retried next run */ }
  }

  // 1. Welcome — new accounts
  for (const p of newProfiles) {
    await send(p.id, 'welcome', (email) => sendWelcome({ to: email, hasShow: hasShow.has(p.id), builderUrl: `${base}/builder`, unsubscribeUrl: unsub(p.id) }))
  }
  // 2. Creator welcome — new subscribers
  for (const s of newSubs) {
    await send(s.user_id, 'creator_welcome', (email) => sendCreatorWelcome({ to: email, builderUrl: `${base}/builder`, unsubscribeUrl: unsub(s.user_id) }))
  }
  // 3. First export — celebrate the first export per user
  const seen = new Set<string>()
  for (const x of recentExports) {
    if (seen.has(x.user_id)) continue
    seen.add(x.user_id)
    await send(x.user_id, 'first_export', (email) => sendFirstExportCheers({ to: email, showName: showName.get(x.show_id) || 'your show', unsubscribeUrl: unsub(x.user_id) }))
  }
  return { sent }
}

// ── Retention: renewal reminders (yearly subs) + win-back (dormant users) ────
async function runRetention(admin: Admin) {
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const base = appUrl()
  const unsub = (uid: string) => `${base}/api/email/unsubscribe?u=${uid}&t=${unsubToken(uid)}`
  const getEmail = async (uid: string) => (await admin.auth.admin.getUserById(uid)).data?.user?.email ?? null
  const optedOut = async (uid: string) => {                       // also skips admin/tester (no self-emails)
    const { data } = await admin.from('profiles').select('marketing_opt_out, is_admin, is_tester').eq('id', uid).maybeSingle()
    const p = data as { marketing_opt_out?: boolean; is_admin?: boolean; is_tester?: boolean } | null
    return !!(p?.marketing_opt_out || p?.is_admin || p?.is_tester)
  }
  const logged = async (uid: string, kind: string) =>
    (((await admin.from('email_log').select('id').eq('user_id', uid).eq('kind', kind).limit(1)).data) ?? []).length > 0
  const stamp = (uid: string, kind: string) => admin.from('email_log').insert({ user_id: uid, kind }).then(() => null, () => null)

  // 1. RENEWAL — yearly subscriptions renewing within 10 days (once per cycle).
  let renewSent = 0
  try {
    const { data: subs } = await admin.from('subscriptions')
      .select('user_id, current_period_end')
      .eq('plan', 'creator_yearly').in('status', ['active', 'trialing'])
      .gte('current_period_end', iso(now)).lte('current_period_end', iso(now + 10 * D)).limit(500)
    for (const s of (subs ?? []) as { user_id: string; current_period_end: string | null }[]) {
      if (!s.current_period_end) continue
      const kind = `renewal_${s.current_period_end.slice(0, 10)}`              // one per renewal cycle
      if (await logged(s.user_id, kind) || await optedOut(s.user_id)) continue
      const email = await getEmail(s.user_id); if (!email) continue
      try {
        await sendRenewalReminder({
          to: email,
          renewDateLabel: new Date(s.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          manageUrl: `${base}/dashboard`, unsubscribeUrl: unsub(s.user_id),
        })
        await stamp(s.user_id, kind); renewSent++
      } catch { /* retried next run */ }
    }
  } catch { /* subscriptions/email_log missing */ }

  // 2. WIN-BACK — built a show 30-45d ago and nothing since (once per user).
  let winSent = 0
  try {
    const [{ data: oldShows }, { data: recentShows }, { data: recentExp }] = await Promise.all([
      admin.from('shows').select('user_id').gte('created_at', iso(now - 45 * D)).lte('created_at', iso(now - 30 * D)).limit(2000),
      admin.from('shows').select('user_id').gte('created_at', iso(now - 30 * D)).limit(2000),
      admin.from('exports').select('user_id').gte('created_at', iso(now - 30 * D)).limit(2000),
    ])
    const dormant = [...new Set((oldShows ?? []).map(r => (r as { user_id: string }).user_id))]
    const active = new Set([...(recentShows ?? []), ...(recentExp ?? [])].map(r => (r as { user_id: string }).user_id))
    const targets = dormant.filter(u => !active.has(u))
    for (const uid of targets) {
      if (winSent >= MAX_PER_RUN) break
      if (await logged(uid, 'winback') || await optedOut(uid)) continue
      const email = await getEmail(uid); if (!email) continue
      try {
        await sendWinBack({ to: email, builderUrl: `${base}/builder`, unsubscribeUrl: unsub(uid) })
        await stamp(uid, 'winback'); winSent++
      } catch { /* retried next run */ }
    }
  } catch { /* tables missing */ }

  return { renewSent, winSent }
}
