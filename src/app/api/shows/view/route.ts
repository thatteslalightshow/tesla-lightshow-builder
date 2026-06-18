import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'

// Public, unauthenticated view counter. Called once per show-page load.
export async function POST(req: Request) {
  let body: { token?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin.rpc('increment_show_view', { p_token: body.token })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
