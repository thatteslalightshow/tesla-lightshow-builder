import { NextResponse } from 'next/server'
import { genreToVibe } from '@/lib/genre-vibe'

// Look up a song's genre from Apple's free iTunes Search API (no auth key needed) and map it to an
// engine vibe. Only the song's title/artist TEXT is sent out — never audio — so this stays consistent
// with the BYOM (bring-your-own-music) privacy design. Response is cached hard: a given song's genre
// doesn't change, and this keeps us well under Apple's ~20 req/min courtesy limit during batch runs.
export const revalidate = 86400

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ genre: null, vibe: null })
  try {
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`,
      { next: { revalidate: 86400 } },
    )
    if (!r.ok) return NextResponse.json({ genre: null, vibe: null })
    const data = await r.json()
    const genre: string | null = data?.results?.[0]?.primaryGenreName ?? null
    return NextResponse.json(
      { genre, vibe: genreToVibe(genre) },
      { headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800' } },
    )
  } catch {
    return NextResponse.json({ genre: null, vibe: null })
  }
}
