import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { sendReengagement } from '@/lib/email'
import { unsubToken, appUrl } from '@/lib/reengage'

export const maxDuration = 60

const H = 3600000, D = 86400000
const MAX_PER_RUN = 200
const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S', modelX: 'Model X', cybertruck: 'Cybertruck',
}

type Cand = { id: string; user_id: string; name: string | null; tesla_model: string; song_title: string | null }
type Prof = { id: string; is_admin: boolean | null; is_tester: boolean | null; marketing_opt_out: boolean | null }

// Daily Vercel cron (CRON_SECRET-guarded). Two-touch abandoned-show re-engagement:
//   touch 1 (~48h): show created 48–96h ago, never nudged
//   touch 2 (~5d):  show created 5–10d ago, got the 48h nudge, still not exported
// Only non-subscriber, non-admin/tester, non-opted-out owners whose show has NO export.
// Stamps shows.reengage_48_at / reengage_5d_at after a successful send so it never repeats.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()
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
    return NextResponse.json({ ok: false, error: 'reengage columns not migrated yet' }, { status: 200 })
  }

  const all = [...t1, ...t2]
  if (all.length === 0) return NextResponse.json({ ok: true, sent: 0 })

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
      if (sent >= MAX_PER_RUN) break
      if (!eligible(s)) continue
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

  return NextResponse.json({ ok: true, sent, candidates: all.length })
}
