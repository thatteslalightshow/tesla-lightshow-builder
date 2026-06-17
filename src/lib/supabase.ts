import { createClient } from '@supabase/supabase-js'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export type TeslaModel = 'model3' | 'modelY' | 'modelS' | 'modelX' | 'cybertruck'
export type ShowStyle  = 'energetic' | 'wave' | 'strobe' | 'chase'
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
  created_at:   string
  updated_at:   string
}

export const supabase = createClientComponentClient()

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
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'
])

export const MAX_AUDIO_SIZE = 50 * 1024 * 1024

export function validateAudioFile(file: File): string | null {
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) return 'Only MP3 and WAV files are allowed'
  if (file.size > MAX_AUDIO_SIZE) return 'File must be under 50MB'
  return null
}
