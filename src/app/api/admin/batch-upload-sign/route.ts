import { NextResponse } from 'next/server'
import { getAdminClient, sanitizeFileName } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// Admin/tester batch tool — sign a direct upload to a temp batch/ path (no show row).
// The browser PUTs each song to Supabase directly (Vercel caps function bodies ~4.5MB),
// then /api/admin/batch-export reads + processes + deletes them.
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = getAdminClient()
  const { data: prof } = await admin.from('profiles').select('is_admin, is_tester').eq('id', user.id).single()
  if (!prof?.is_admin && !prof?.is_tester) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { file_name?: string; file_size?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.file_name) return NextResponse.json({ error: 'Missing file_name' }, { status: 400 })
  // The browser converts every song to a 44.1kHz WAV client-side before upload, so we accept
  // .wav here (and a few raw types for safety). WAVs are large → a generous 250MB cap.
  if (!/\.(wav|mp3|m4a|aac|ogg|flac|mp4)$/i.test(body.file_name)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  if ((body.file_size ?? 0) > 250 * 1024 * 1024) return NextResponse.json({ error: 'File too large (250MB max)' }, { status: 400 })

  const path = `batch/${user.id}/${crypto.randomUUID()}-${sanitizeFileName(body.file_name)}`
  const { data, error } = await admin.storage.from('audio-files').createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not sign upload' }, { status: 500 })
  return NextResponse.json({ path, token: data.token })
}
