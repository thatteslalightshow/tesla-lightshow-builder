import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAdminClient, validateAudioFile, sanitizeFileName } from '@/lib/supabase'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  const showId = form.get('show_id') as string | null
  if (!file || !showId) return NextResponse.json({ error: 'Missing file or show_id' }, { status: 400 })

  const validationError = validateAudioFile(file)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  // Verify show belongs to this user
  const admin = getAdminClient()
  const { data: show, error: showErr } = await admin
    .from('shows')
    .select('id')
    .eq('id', showId)
    .eq('user_id', session.user.id)
    .single()
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  // Delete any previous audio for this show to avoid orphaned files
  const { data: existing } = await admin
    .from('audio_files')
    .select('storage_path')
    .eq('show_id', showId)
  if (existing?.length) {
    await admin.storage.from('audio-files').remove(existing.map(r => r.storage_path))
    await admin.from('audio_files').delete().eq('show_id', showId)
  }

  const safeName = sanitizeFileName(file.name)
  const storagePath = `${session.user.id}/${showId}/${Date.now()}-${safeName}`

  const { error: uploadErr } = await admin.storage
    .from('audio-files')
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data, error: dbErr } = await admin
    .from('audio_files')
    .insert({
      user_id: session.user.id,
      show_id: showId,
      original_name: file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      mime_type: file.type,
    })
    .select()
    .single()
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json(data)
}
