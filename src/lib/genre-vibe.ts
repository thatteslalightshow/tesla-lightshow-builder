// Map a music-service genre string (e.g. Apple/iTunes `primaryGenreName`) to one of the engine's
// vibe presets. This is the PRIMARY vibe source: matching a song to Apple's own classification is far
// more reliable than guessing the vibe from raw audio features. Returns null when nothing matches, so
// the caller can fall back to the audio classifier (classifyVibe).
//
// Country maps to its own dedicated 'country' vibe preset (MIX_PRESETS.country).
export const COUNTRY_VIBE = 'country'

export function genreToVibe(genre: string | undefined | null): string | null {
  if (!genre) return null
  const g = genre.toLowerCase()
  if (/\b(edm|electronic|electronica|dance|house|techno|trance|dubstep|drum\s*&?\s*bass|d&b|dnb)\b/.test(g)) return 'edm'
  if (/\b(hip[\s-]?hop|rap|trap|r&b|rnb|soul)\b/.test(g)) return 'hiphop'
  if (/\b(rock|metal|punk|grunge|indie|emo)\b/.test(g)) return 'rock'   // note: "Alternative Rock" hits this via "rock"
  if (/\b(country|americana|bluegrass)\b/.test(g)) return COUNTRY_VIBE
  if (/\b(alternative|classical|soundtrack|score|orchestral|cinematic|opera|new age|ambient)\b/.test(g)) return 'cinematic'  // plain "Alternative" (e.g. Imagine Dragons)
  if (/\b(pop|k-pop)\b/.test(g)) return 'pop'
  return null   // jazz/blues/folk/latin/world/etc. → let the audio classifier decide
}
