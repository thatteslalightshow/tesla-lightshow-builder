import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// Toggle a like on a show. Auth required (cookie or bearer token).
// GET  → { liked, like_count } for the current user
// POST → toggles, returns { liked, like_count }
export async function GET(req: Request) {
  const user = await getAuthedUser(req)
  const url = new URL(req.url)
  const showId = url.searchParams.get('show_id')
  if (!showId) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  const admin = getAdminClient()
  const { data: show } = await admin.from('shows').select('like_count').eq('id', showId).maybeSingle()
  let liked = false
  if (user) {
    const { data: row } = await admin
      .from('show_likes').select('show_id').eq('user_id', user.id).eq('show_id', showId).maybeSingle()
    liked = !!row
  }
  return NextResponse.json({ liked, like_count: show?.like_count ?? 0 })
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  const admin = getAdminClient()
  const { data: existing } = await admin
    .from('show_likes').select('show_id').eq('user_id', user.id).eq('show_id', body.show_id).maybeSingle()

  if (existing) {
    await admin.from('show_likes').delete().eq('user_id', user.id).eq('show_id', body.show_id)
  } else {
    await admin.from('show_likes').insert({ user_id: user.id, show_id: body.show_id })
  }

  // Read back the trigger-updated count
  const { data: show } = await admin.from('shows').select('like_count').eq('id', body.show_id).maybeSingle()
  return NextResponse.json({ liked: !existing, like_count: show?.like_count ?? 0 })
}
