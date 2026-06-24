import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAdminClient, validateAudioMeta, sanitizeFileName } from '@/lib/supabase'

// Step 1 of audio upload: verify ownership, clear any previous audio, and hand
// back a signed URL the browser uploads to DIRECTLY. The file never passes
// through this function — Vercel caps request bodies at ~4.5MB, well under a
// full-song WAV (~10MB/min), so streaming it here would always fail. The browser
// PUTs to Supabase Storage, then calls /api/upload/commit to record the row.
export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id?: string; file_name?: string; file_size?: number }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { show_id: showId, file_name: fileName, file_size: fileSize } = body
  if (!showId || !fileName) return NextResponse.json({ error: 'Missing file_name or show_id' }, { status: 400 })

  const validationError = validateAudioMeta(fileName, fileSize ?? 0)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const admin = getAdminClient()
  const { data: show, error: showErr } = await admin
    .from('shows').select('id').eq('id', showId).eq('user_id', session.user.id).single()
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  // Remove any previous audio for this show so we don't orphan files — but NOT
  // a file that another show still references (hybrid community storage: buyers'
  // copies share the canonical file, so re-uploading must never yank it out from
  // under them). Only delete storage objects unreferenced by any other show.
  const { data: existing } = await admin
    .from('audio_files').select('storage_path').eq('show_id', showId)
  if (existing?.length) {
    const paths = existing.map(r => r.storage_path)
    const { data: otherRefs } = await admin
      .from('audio_files').select('storage_path').in('storage_path', paths).neq('show_id', showId)
    const shared = new Set((otherRefs ?? []).map(r => r.storage_path))
    const removable = paths.filter(p => !shared.has(p))
    if (removable.length) await admin.storage.from('audio-files').remove(removable)
    await admin.from('audio_files').delete().eq('show_id', showId)
  }

  const safeName = sanitizeFileName(fileName)
  const storagePath = `${session.user.id}/${showId}/${Date.now()}-${safeName}`

  const { data, error } = await admin.storage
    .from('audio-files').createSignedUploadUrl(storagePath)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not create upload URL' }, { status: 500 })
  }

  return NextResponse.json({ path: data.path, token: data.token })
}
