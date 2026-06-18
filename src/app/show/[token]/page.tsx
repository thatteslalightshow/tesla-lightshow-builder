import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/supabase'
import ShowPreview from './ShowPreview'

interface Props {
  params: { token: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const admin = getAdminClient()
  const { data: show } = await admin
    .from('shows')
    .select('name, tesla_model, style')
    .eq('share_token', params.token)
    .eq('is_public', true)
    .single()

  if (!show) return { title: 'Tesla LightShow Builder' }

  const modelLabel: Record<string, string> = {
    model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
    modelX: 'Model X', cybertruck: 'Cybertruck',
  }

  return {
    title: `${show.name} — Tesla LightShow Builder`,
    description: `A ${show.style} light show for the ${modelLabel[show.tesla_model] ?? show.tesla_model}. Built with LightShow Builder.`,
  }
}

export default async function ShowPage({ params }: Props) {
  const admin = getAdminClient()
  const { data: show } = await admin
    .from('shows')
    .select('*')
    .eq('share_token', params.token)
    .single()

  if (!show) return notFound()

  if (!show.is_public) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <div style={{ fontSize: '2.5rem' }}>🔒</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700 }}>This show is private</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>The owner hasn&apos;t made this show public yet.</p>
        <a href="/" className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }}>← Back to LightShow Builder</a>
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

  return <ShowPreview show={show} audioUrl={audioUrl} audioName={audioFile?.original_name ?? null} />
}
