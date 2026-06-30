import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAdminClient, type ShowStyle } from '@/lib/supabase'
import { rateLimitOk } from '@/lib/rate-limit'

// Heuristic: map BPM ranges to recommended styles
function recommendStyle(bpm: number): ShowStyle {
  if (bpm >= 140) return 'strobe'
  if (bpm >= 110) return 'energetic'
  if (bpm >= 80)  return 'chase'
  return 'wave'
}

function recommendIntensity(bpm: number): number {
  return Math.min(100, Math.max(20, Math.round((bpm - 60) / 140 * 80 + 20)))
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()   // getUser revalidates the JWT (rejects revoked cookies)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id: string; bpm?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  const admin = getAdminClient()
  if (!(await rateLimitOk(admin, user.id, 'generate', 20))) {
    return NextResponse.json({ error: 'Too many requests — please try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }
  const { data: show, error: showErr } = await admin
    .from('shows')
    .select('*')
    .eq('id', body.show_id)
    .eq('user_id', user.id)
    .single()
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  // Use provided BPM or the show's current BPM, falling back to 120
  const bpm = body.bpm ?? show.bpm ?? 120
  const style = recommendStyle(bpm)
  const intensity = recommendIntensity(bpm)

  // Check if there's linked audio to get beat_count
  const { data: audio } = await admin
    .from('audio_files')
    .select('duration_sec')
    .eq('show_id', body.show_id)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single()

  const duration = audio?.duration_sec ?? show.duration_sec ?? null
  const beatCount = duration ? Math.round((bpm / 60) * duration) : show.beat_count

  // Persist recommendations back to the show
  const { data: updated, error: updateErr } = await admin
    .from('shows')
    .update({ bpm, style, intensity, beat_count: beatCount, updated_at: new Date().toISOString() })
    .eq('id', body.show_id)
    .select()
    .single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ show: updated, recommendations: { bpm, style, intensity, beat_count: beatCount } })
}
