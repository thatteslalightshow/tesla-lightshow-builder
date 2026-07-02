import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { getAdminClient } from '@/lib/supabase'

// Step 2 of audio upload: after the browser has PUT the file straight to Storage
// via the signed URL from /api/upload, record the audio_files row. Only metadata
// is sent here, so it's a tiny request well under Vercel's body limit.
export async function POST(req: Request) {
  const supabase = await createRouteClient()
  const { data: { user } } = await supabase.auth.getUser()   // getUser revalidates the JWT (rejects revoked cookies)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id?: string; path?: string; original_name?: string; file_size?: number; mime_type?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { show_id: showId, path, original_name: originalName, file_size: fileSize, mime_type: mimeType } = body
  if (!showId || !path) return NextResponse.json({ error: 'Missing show_id or path' }, { status: 400 })

  const admin = getAdminClient()

  // Verify the show belongs to this user, and that the path is in their folder
  const { data: show, error: showErr } = await admin
    .from('shows').select('id').eq('id', showId).eq('user_id', user.id).single()
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })
  if (!path.startsWith(`${user.id}/${showId}/`)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Confirm the object actually landed in Storage before recording it
  const folder = path.slice(0, path.lastIndexOf('/'))
  const name = path.slice(path.lastIndexOf('/') + 1)
  const { data: listed } = await admin.storage.from('audio-files').list(folder, { search: name })
  if (!listed?.some(o => o.name === name)) {
    return NextResponse.json({ error: 'Upload not found in storage' }, { status: 400 })
  }

  const { data, error: dbErr } = await admin
    .from('audio_files').insert({
      user_id: user.id,
      show_id: showId,
      original_name: originalName ?? name,
      storage_path: path,
      file_size_bytes: fileSize ?? 0,
      mime_type: mimeType ?? 'application/octet-stream',
    }).select().single()
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json(data)
}
