import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

export type TeslaModel = 'model3' | 'modelY' | 'modelS' | 'modelX' | 'cybertruck'
export type ShowStyle  = 'energetic' | 'wave' | 'strobe' | 'chase' | 'pulse' | 'ripple' | 'bounce' | 'twinkle'
export type SubTier    = 'free' | 'pro' | 'team'

export interface Profile {
  id:           string
  display_name: string | null
  avatar_url:   string | null
  subscription: SubTier
  shows_count:  number
  created_at:   string
  updated_at:   string
}

export interface Show {
  id:           string
  user_id:      string
  name:         string
  tesla_model:  TeslaModel
  style:        ShowStyle
  intensity:    number
  bpm:          number | null
  beat_count:   number | null
  duration_sec: number | null
  is_public:    boolean
  share_token:  string
  view_count:   number
  like_count:   number
  song_title:   string | null
  song_artist:  string | null
  source_show_id: string | null  // set when this show was acquired from a community show
  created_at:   string
  updated_at:   string
}

// Browser (client-component) client — @supabase/ssr replaces the deprecated auth-helpers
// (removed with the Next 16 upgrade; auth-helpers relied on synchronous cookies()).
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export function getAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase server env vars')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function getSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresIn = 900
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
  if (error || !data) throw new Error('Failed to create download URL')
  return data.signedUrl
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 100)
}

export const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm',
])
const ALLOWED_AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.mp4', '.aac', '.ogg', '.flac', '.webm']

// 70MB accommodates the converted WAV (~10MB/min) for typical song lengths.
export const MAX_AUDIO_SIZE = 70 * 1024 * 1024

export function validateAudioFile(file: File): string | null {
  // Accept by MIME or extension — browsers report inconsistent MIME types,
  // and we convert anything decodable to WAV anyway.
  const ext = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
  if (!ALLOWED_AUDIO_TYPES.has(file.type) && !ALLOWED_AUDIO_EXT.includes(ext)) {
    return 'Please upload an audio file (MP3, WAV, M4A, AAC, OGG, FLAC)'
  }
  if (file.size > MAX_AUDIO_SIZE) return 'File must be under 70MB'
  return null
}

// Files upload straight from the browser to Storage (Vercel functions cap the
// request body at ~4.5MB, far below a full-song WAV), so the API only sees
// metadata. Validate on name + size instead of the File object.
export function validateAudioMeta(name: string, size: number): string | null {
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
  if (!ALLOWED_AUDIO_EXT.includes(ext)) {
    return 'Please upload an audio file (MP3, WAV, M4A, AAC, OGG, FLAC)'
  }
  if (size > MAX_AUDIO_SIZE) return 'File must be under 70MB'
  return null
}
