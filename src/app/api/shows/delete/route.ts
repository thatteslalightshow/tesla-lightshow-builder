import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'
import { deleteShowAudio } from '@/lib/audio-storage'

// Delete a show AND its uploaded audio — BYOM: if the owner deletes the show, the
// song goes with it (no orphaned copyrighted audio left on our servers). Auth +
// ownership required. Audio is removed ref-count-safe (shared files are protected).
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { show_id?: string }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  const admin = getAdminClient()
  const { data: show } = await admin.from('shows').select('id, user_id').eq('id', body.show_id).single()
  if (!show || show.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await deleteShowAudio(admin, body.show_id).catch(() => null)            // song goes too
  const { error } = await admin.from('shows').delete().eq('id', body.show_id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
