import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase'
import GalleryClient, { type GalleryShow } from './GalleryClient'
import BrandLogo from '@/components/BrandLogo'

export const metadata: Metadata = {
  title: 'Show Gallery',
  description: 'Browse community-created Tesla light shows. Preview, like, or remix any public show.',
}

export const revalidate = 30

type MaybeArr<T> = T | T[] | null

interface ShowRow {
  id: string
  name: string
  tesla_model: string
  style: string
  intensity: number
  bpm: number | null
  share_token: string
  view_count: number | null
  like_count: number | null
  song_title?: string | null
  song_artist?: string | null
  created_at: string
  profiles: MaybeArr<{ display_name: string | null; is_admin: boolean | null }>
}

function first<T>(v: MaybeArr<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// "Kickstart_My_Heart__2021-_Remaster_.mp3" -> "Kickstart My Heart 2021 Remaster"
function titleFromFile(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export default async function GalleryPage() {
  const admin = getAdminClient()

  // is_admin (for the OFFICIAL badge) lives on profiles and always exists, so
  // it's in both selects. Only song_title/song_artist depend on the newer
  // migration — if that hasn't run, FULL errors and we fall back to BASE.
  const FULL = 'id, name, tesla_model, style, intensity, bpm, share_token, view_count, like_count, song_title, song_artist, created_at, profiles(display_name, is_admin)'
  const BASE = 'id, name, tesla_model, style, intensity, bpm, share_token, created_at, profiles(display_name, is_admin)'

  let rows: ShowRow[] = []
  const full = await admin
    .from('shows').select(FULL)
    .eq('is_public', true).order('created_at', { ascending: false }).limit(200)

  if (full.error) {
    const base = await admin
      .from('shows').select(BASE)
      .eq('is_public', true).order('created_at', { ascending: false }).limit(200)
    rows = (base.error ? [] : base.data ?? []) as ShowRow[]
  } else {
    rows = (full.data ?? []) as ShowRow[]
  }

  // Fetch audio filenames separately (a fallback title for shows with no
  // song_title yet). Kept out of the main query so an embed quirk can't break it.
  const audioByShow = new Map<string, string>()
  const ids = rows.map(r => r.id)
  if (ids.length) {
    const { data: audios } = await admin
      .from('audio_files').select('show_id, original_name').in('show_id', ids)
    for (const a of (audios ?? []) as { show_id: string; original_name: string | null }[]) {
      if (a.original_name && !audioByShow.has(a.show_id)) audioByShow.set(a.show_id, a.original_name)
    }
  }

  const shows: GalleryShow[] = rows.map(r => {
    const profile = first(r.profiles)
    const isOfficial = profile?.is_admin === true
    const fileName = audioByShow.get(r.id)
    const title = r.song_title?.trim()
      || (fileName ? titleFromFile(fileName) : '')
      || r.name
    return {
      id: r.id, name: r.name, tesla_model: r.tesla_model, style: r.style,
      intensity: r.intensity, bpm: r.bpm, share_token: r.share_token,
      view_count: r.view_count ?? 0, like_count: r.like_count ?? 0,
      created_at: r.created_at,
      title,
      artist: r.song_artist?.trim() || null,
      creator: isOfficial ? 'ThatTeslaLightshow' : (profile?.display_name ?? 'Anonymous'),
      official: isOfficial,
    }
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header — consistent with dashboard */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 2rem', borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <BrandLogo />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/pricing" className="btn btn-ghost btn-sm">Pricing</Link>
          <Link href="/builder" className="btn btn-primary btn-sm">+ New Show</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 700, marginBottom: 10 }}>
            Community Shows
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 540, lineHeight: 1.6 }}>
            Real light shows shared by the community — each preview animates the actual pattern.
            Click any show to watch it in 3D, then remix it into your own.
          </p>
        </div>

        {shows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No public shows yet</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Be the first to share a show with the community.</p>
            <Link href="/builder" className="btn btn-primary">Create a Show</Link>
          </div>
        ) : (
          <GalleryClient shows={shows} />
        )}
      </main>
    </div>
  )
}
