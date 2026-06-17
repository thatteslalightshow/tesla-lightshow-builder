import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase'

export const metadata: Metadata = {
  title: 'Show Gallery — Tesla LightShow Builder',
  description: 'Browse community-created Tesla light shows. Preview, download, or remix any public show.',
}

export const revalidate = 60

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}

const STYLE_LABELS: Record<string, string> = {
  energetic: 'Energetic', wave: 'Wave', strobe: 'Strobe', chase: 'Chase',
}

const STYLE_COLOR: Record<string, string> = {
  energetic: 'rgba(232,64,74,0.15)', wave: 'rgba(0,100,255,0.15)',
  strobe: 'rgba(255,255,100,0.12)', chase: 'rgba(0,232,135,0.12)',
}
const STYLE_TEXT: Record<string, string> = {
  energetic: '#ff8a8a', wave: '#80b0ff', strobe: '#ffe57a', chase: '#00e887',
}

interface ShowRow {
  id: string
  name: string
  tesla_model: string
  style: string
  intensity: number
  bpm: number | null
  share_token: string
  created_at: string
  profiles: { display_name: string | null } | { display_name: string | null }[] | null
}

export default async function GalleryPage() {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('shows')
    .select('id, name, tesla_model, style, intensity, bpm, share_token, created_at, profiles(display_name)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(60)

  const shows: ShowRow[] = (error ? [] : data ?? []) as ShowRow[]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '0 24px', height: 60, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <Link href="/" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>
          Tesla LightShow <span style={{ color: 'var(--red)' }}>Builder</span>
        </Link>
        <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/gallery" className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--red)' }}>Gallery</Link>
          <Link href="/builder" className="btn btn-primary btn-sm">+ New Show</Link>
        </nav>
      </header>

      {/* Page content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
            fontWeight: 700, marginBottom: 12,
          }}>
            Community Shows
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 520 }}>
            Browse light shows shared by the community. Click Preview to see it in action,
            or Remix to open it in the builder and make it your own.
          </p>
        </div>

        {shows.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {shows.map(show => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ShowCard({ show }: { show: ShowRow }) {
  const created = new Date(show.created_at)
  const ago = timeAgo(created)
  const profileEntry = Array.isArray(show.profiles) ? show.profiles[0] : show.profiles
  const creator = profileEntry?.display_name ?? 'Anonymous'

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'border-color .15s',
    }}>
      {/* Top row: model + style badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600,
          color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          {MODEL_LABELS[show.tesla_model] ?? show.tesla_model}
        </span>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: STYLE_COLOR[show.style] ?? 'var(--bg3)',
          color: STYLE_TEXT[show.style] ?? 'var(--muted)',
        }}>
          {STYLE_LABELS[show.style] ?? show.style}
        </span>
      </div>

      {/* Show name */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
          lineHeight: 1.3, marginBottom: 4, color: 'var(--text)',
        }}>
          {show.name}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          by {creator} · {ago}
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16 }}>
        {show.bpm && (
          <Stat label="BPM" value={String(show.bpm)} />
        )}
        <Stat label="Intensity" value={`${show.intensity}%`} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        <Link
          href={`/show/${show.share_token}`}
          className="btn btn-ghost btn-sm"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          Preview
        </Link>
        <Link
          href={`/builder?remix=${show.share_token}`}
          className="btn btn-outline btn-sm"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          Remix
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '80px 24px',
      border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        No public shows yet
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
        Be the first to share a show with the community.
      </p>
      <Link href="/builder" className="btn btn-primary">Create a Show</Link>
    </div>
  )
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
