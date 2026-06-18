import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase'
import GalleryClient, { type GalleryShow } from './GalleryClient'

export const metadata: Metadata = {
  title: 'Show Gallery — Tesla LightShow Builder',
  description: 'Browse community-created Tesla light shows. Preview, like, or remix any public show.',
}

export const revalidate = 30

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
  created_at: string
  profiles: { display_name: string | null } | { display_name: string | null }[] | null
}

export default async function GalleryPage() {
  const admin = getAdminClient()

  // Prefer the full select with engagement counts. If the engagement
  // migration hasn't been run yet, those columns won't exist — fall back
  // to the base columns so the gallery never breaks.
  const FULL = 'id, name, tesla_model, style, intensity, bpm, share_token, view_count, like_count, created_at, profiles(display_name)'
  const BASE = 'id, name, tesla_model, style, intensity, bpm, share_token, created_at, profiles(display_name)'

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
  const shows: GalleryShow[] = rows.map(r => {
    const profileEntry = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return {
      id: r.id, name: r.name, tesla_model: r.tesla_model, style: r.style,
      intensity: r.intensity, bpm: r.bpm, share_token: r.share_token,
      view_count: r.view_count ?? 0, like_count: r.like_count ?? 0,
      created_at: r.created_at, creator: profileEntry?.display_name ?? 'Anonymous',
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
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--red)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', fontFamily: 'var(--font-display)' }}>T</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>LightShow Builder</span>
        </Link>
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
