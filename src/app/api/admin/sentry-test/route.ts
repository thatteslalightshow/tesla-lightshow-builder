import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// TEMPORARY: admin-only Sentry pipeline check. Visit /api/admin/sentry-test while
// signed in as an admin; it sends one test error to Sentry and flushes it, so it
// lands in your Issues dashboard within seconds. Remove this route once verified.
export async function GET(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = getAdminClient()
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const eventId = Sentry.captureException(
    new Error(`Sentry test error — fired by admin at ${new Date().toISOString()}`)
  )
  await Sentry.flush(2000)

  return NextResponse.json({
    ok: true,
    eventId,
    sentryActive: !!process.env.SENTRY_DSN,
    message: eventId
      ? 'Test error sent to Sentry — check your Issues dashboard.'
      : 'Sentry did not return an event id — confirm SENTRY_DSN is set in Vercel and you redeployed.',
  })
}
