import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'

// Public: the most recent ADMIN-APPROVED real-car video links, for the homepage "real Teslas" strip.
// Only exposes fields already public on the gallery/show pages, and only approved+public rows.
export const revalidate = 60

export async function GET() {
  const admin = getAdminClient()
  const { data } = await admin
    .from('shows')
    .select('share_token, name, tesla_model, social_url, social_thumb_url, like_count')
    .eq('is_public', true)
    .eq('social_status', 'approved')
    .not('social_url', 'is', null)
    .not('social_thumb_url', 'is', null)
    .order('social_submitted_at', { ascending: false })
    .limit(8)

  const videos = (data ?? [])
    .filter((r) => r.share_token && r.social_thumb_url)
    .map((r) => ({
      token: r.share_token as string,
      name: r.name as string,
      model: r.tesla_model as string,
      thumb: r.social_thumb_url as string,
      likes: (r.like_count as number) ?? 0,
    }))

  return NextResponse.json({ videos })
}
