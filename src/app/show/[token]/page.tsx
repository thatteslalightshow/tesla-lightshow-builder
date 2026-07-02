import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/supabase'
import { resolveSongLinks } from '@/lib/song-links'
import ShowPreview from './ShowPreview'

// Render per-request so the view/like counts are always live, not cached.
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>   // async in Next 15+; sync access removed in 16
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const admin = getAdminClient()
  const { data: show } = await admin
    .from('shows')
    .select('name, tesla_model, style')
    .eq('share_token', token)
    .eq('is_public', true)
    .single()

  if (!show) return { title: 'Light Show' }

  const modelLabel: Record<string, string> = {
    model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
    modelX: 'Model X', cybertruck: 'Cybertruck',
  }

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://thatteslalightshow.com'}/show/${token}`

  return {
    title: show.name,
    description: `A ${show.style} light show for the ${modelLabel[show.tesla_model] ?? show.tesla_model}. Built with ThatTeslaLightshow.`,
    openGraph: {
      title: show.name,
      description: `${modelLabel[show.tesla_model] ?? show.tesla_model} · ${show.style} · Built with @ThatTeslaLightshow`,
      url,
      siteName: 'ThatTeslaLightshow',
      type: 'website',
      images: [{ url: '/brand/og.png', width: 1200, height: 630, alt: 'That Lightshow — Tesla Lightshow Builder' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: show.name,
      description: `${modelLabel[show.tesla_model] ?? show.tesla_model} · ${show.style} light show. Built with @ThatTeslaLightshow`,
      site: '@ThatTeslaLightshow',
      images: ['/brand/og.png'],
    },
  }
}

export default async function ShowPage({ params }: Props) {
  const { token } = await params
  const admin = getAdminClient()
  const { data: show } = await admin
    .from('shows')
    .select('*')
    .eq('share_token', token)
    .single()

  if (!show) return notFound()

  if (!show.is_public) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <div style={{ fontSize: '2.5rem' }}>🔒</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700 }}>This show is private</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>The owner hasn&apos;t made this show public yet.</p>
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }}>← Back to ThatTeslaLightshow</Link>
      </div>
    )
  }

  // Fetch a signed audio URL (1-hour expiry) if this show has an audio file
  let audioUrl: string | null = null
  const { data: audioFile } = await admin
    .from('audio_files')
    .select('storage_path, original_name')
    .eq('show_id', show.id)
    .single()
  if (audioFile?.storage_path) {
    const { data: signed } = await admin.storage
      .from('audio-files')
      .createSignedUrl(audioFile.storage_path, 3600)
    audioUrl = signed?.signedUrl ?? null
  }

  // Resolve free EXACT streaming links for the song (BYOM — bring your own copy).
  const s = show as { song_title?: string | null; song_artist?: string | null }
  const songLinks = await resolveSongLinks(s.song_title, s.song_artist, audioFile?.original_name ?? show.name)

  return <ShowPreview show={show} audioUrl={audioUrl} audioName={audioFile?.original_name ?? null} songLinks={songLinks} />
}
