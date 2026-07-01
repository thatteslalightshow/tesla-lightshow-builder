// Allowlist + normalization for a community show's linked social post. We only accept platforms whose
// posts we can (a) verify via a public oEmbed and (b) rely on for the music license the video carries.
// Instagram's oEmbed now needs a Facebook app token → deferred to a follow-up.
export type SocialProvider = 'tiktok' | 'youtube'
export interface SocialLink { provider: SocialProvider; url: string; oembed: string }

export const SOCIAL_LABEL: Record<SocialProvider, string> = { tiktok: 'TikTok', youtube: 'YouTube' }

export function parseSocialLink(raw: string): SocialLink | null {
  let u: URL
  try { u = new URL((raw || '').trim()) } catch { return null }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  const clean = `${u.origin}${u.pathname}${u.search}`   // drop hash/fragment
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return { provider: 'tiktok', url: clean, oembed: `https://www.tiktok.com/oembed?url=${encodeURIComponent(clean)}` }
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    return { provider: 'youtube', url: clean, oembed: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(clean)}` }
  }
  return null
}

export function providerOf(url: string | null | undefined): SocialProvider | null {
  return url ? (parseSocialLink(url)?.provider ?? null) : null
}
