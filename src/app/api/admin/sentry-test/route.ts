import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// TEMPORARY diagnostic: reports whether the event was ACTUALLY delivered + which
// Sentry region/project the DSN points to (no secret key exposed). Admin only.
export async function GET(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = getAdminClient()
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const client = Sentry.getClient()
  const dsn = process.env.SENTRY_DSN || ''
  let dsnHost = '', dsnProject = ''
  try { const u = new URL(dsn); dsnHost = u.host; dsnProject = u.pathname } catch { /* malformed DSN */ }

  const eventId = Sentry.captureException(new Error(`Sentry diagnostic — ${new Date().toISOString()}`))
  const flushed = await Sentry.flush(5000)   // TRUE = event sent; FALSE = send failed/timed out

  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    sentryDsnPresent: !!dsn,
    dsnHost,                                  // expect: o<id>.ingest.us.sentry.io  (US region)
    dsnProject,                               // expect: /<your javascript-nextjs project id>
    clientActive: !!client,
    clientEnabled: client?.getOptions?.()?.enabled,
    eventId,
    flushed,                                  // ← the real signal: did it reach Sentry?
  })
}
