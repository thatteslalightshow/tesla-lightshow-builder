import { NextResponse } from 'next/server'
import { parseSocialLink } from '@/lib/social-link'

// Validate a pasted social link (allowlist) and fetch its PUBLIC oEmbed metadata + cover thumbnail.
// Only public post metadata is fetched — never the video — so this stays copyright/BYOM-clean. The
// thumbnail is proxied back as a data URL so the client can run the on-device car/appropriateness
// check on it WITHOUT a cross-origin tainted canvas. Cached briefly.
export async function POST(req: Request) {
  let body: { url?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 }) }
  const link = parseSocialLink(body.url ?? '')
  if (!link) return NextResponse.json({ ok: false, error: 'Please paste a public TikTok or YouTube link.' }, { status: 400 })

  try {
    const r = await fetch(link.oembed, { headers: { 'User-Agent': 'ThatTeslaLightshow/1.0' }, next: { revalidate: 3600 } })
    if (!r.ok) return NextResponse.json({ ok: false, error: "Couldn't read that post — make sure it's public." }, { status: 400 })
    const data = await r.json() as { thumbnail_url?: string; title?: string; author_name?: string }

    let thumbnail: string | null = null
    if (data.thumbnail_url) {
      try {
        const ir = await fetch(data.thumbnail_url, { next: { revalidate: 3600 } })
        if (ir.ok) {
          const buf = Buffer.from(await ir.arrayBuffer())
          if (buf.byteLength <= 5_000_000) {   // sanity cap
            thumbnail = `data:${ir.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`
          }
        }
      } catch { /* thumbnail optional; moderation will fail closed on the client if absent */ }
    }
    return NextResponse.json(
      // `thumbnail` = same-origin data URL for the on-device check; `thumbUrl` = raw platform URL to store
      // for the admin review preview.
      { ok: true, provider: link.provider, url: link.url, title: data.title ?? null, author: data.author_name ?? null, thumbnail, thumbUrl: data.thumbnail_url ?? null },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } },
    )
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not reach the platform. Try again.' }, { status: 502 })
  }
}
