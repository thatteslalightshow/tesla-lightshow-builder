import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// Sign a direct upload of the builder's client-computed FSEQ to a staging path, so the export
// "fast path" can skip re-analyzing the song (it uses the exact frames the builder previewed).
// Verifies the show belongs to the caller. The export route validates the bytes before trusting
// them, so a bad upload just falls back to normal server analysis.
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  const admin = getAdminClient()
  const { data: show, error } = await admin.from('shows').select('id').eq('id', body.show_id).eq('user_id', user.id).single()
  if (error || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  const path = `${user.id}/${body.show_id}/incoming.fseq`
  const { data, error: signErr } = await admin.storage.from('fseq-exports').createSignedUploadUrl(path, { upsert: true })
  if (signErr || !data) return NextResponse.json({ error: signErr?.message ?? 'Could not sign upload' }, { status: 500 })
  return NextResponse.json({ path, token: data.token })
}
