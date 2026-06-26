// Resolve a song (by title/artist) to EXACT streaming links — free, no credentials:
//   1. iTunes Search API (public, no auth) → the exact Apple Music URL + the clean
//      track match (this is the free way to deep-link Apple — no $99 dev account).
//   2. Odesli / song.link (free) → expand that Apple URL to Spotify / YouTube Music.
// Cached hard (a show's song never changes) with short timeouts so a slow/down API
// can't hang the page. Falls back to provider SEARCH links when nothing matches.

export type SongLinks = { apple: string; spotify: string; youtube: string | null; matched: boolean }

async function fetchJson<T>(url: string, ms = 3000): Promise<T | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal, next: { revalidate: 86400 } })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// Spotify Web API (client-credentials) → exact track link. Free, but needs a free
// Spotify app's SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in env. No creds = returns
// null (we then fall back to Odesli/search). Token cached on the warm instance.
let spToken: { token: string; exp: number } | null = null
async function spotifyToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) return null
  if (spToken && spToken.exp > Date.now() + 5000) return spToken.token
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    })
    if (!r.ok) return null
    const j = (await r.json()) as { access_token?: string; expires_in?: number }
    if (!j.access_token) return null
    spToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
    return j.access_token
  } catch {
    return null
  }
}
async function spotifyExact(term: string): Promise<string | null> {
  const token = await spotifyToken()
  if (!token) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  try {
    const r = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(term)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
    if (!r.ok) return null
    const j = (await r.json()) as { tracks?: { items?: { external_urls?: { spotify?: string } }[] } }
    return j.tracks?.items?.[0]?.external_urls?.spotify ?? null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function resolveSongLinks(
  title?: string | null,
  artist?: string | null,
  fallbackName?: string | null,
): Promise<SongLinks> {
  const term = ([title, artist].filter(Boolean).join(' ').trim()) || (fallbackName ?? '').trim()
  const q = encodeURIComponent(term)
  const search: SongLinks = {
    apple: `https://music.apple.com/search?term=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
    youtube: null,
    matched: false,
  }
  if (!term) return search

  // 1. iTunes Search → exact Apple Music link
  const itunes = await fetchJson<{ results?: { trackViewUrl?: string }[] }>(
    `https://itunes.apple.com/search?term=${q}&entity=song&limit=1`,
  )
  const appleUrl = itunes?.results?.[0]?.trackViewUrl
  if (!appleUrl) return search

  // 2. Spotify exact via the Web API (if creds set); else Odesli; else search.
  let spotify = (await spotifyExact(term)) ?? search.spotify
  let youtube: string | null = null
  const odesli = await fetchJson<{ linksByPlatform?: Record<string, { url?: string }> }>(
    `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(appleUrl)}`,
  )
  if (odesli?.linksByPlatform) {
    if (spotify === search.spotify) spotify = odesli.linksByPlatform.spotify?.url ?? spotify
    youtube = odesli.linksByPlatform.youtubeMusic?.url ?? odesli.linksByPlatform.youtube?.url ?? null
  }

  return { apple: appleUrl, spotify, youtube, matched: true }
}
