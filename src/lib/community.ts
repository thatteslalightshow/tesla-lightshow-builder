import { getAdminClient, type TeslaModel } from './supabase'

// Copy a public community show into a buyer's library as their OWN private,
// model-tailored copy. Returns the new show id (or the existing one if they
// already own it). The clone:
//   • is owned by the buyer and set to THEIR Tesla model (closures + channels
//     re-render for their car at export — same lights, right closures),
//   • references the same stored audio (the export reads it via the admin
//     client, so no file is duplicated),
//   • is is_public=false (never re-listed in the gallery),
//   • carries source_show_id for provenance + "already owned" detection.
// Re-acquiring a show you already own is free — it just returns your copy.
export async function cloneCommunityShow(
  sourceShowId: string,
  buyerId: string,
  targetModel: TeslaModel,
): Promise<{ showId: string } | { error: string }> {
  const admin = getAdminClient()

  const { data: src, error: srcErr } = await admin
    .from('shows').select('*').eq('id', sourceShowId).eq('is_public', true).single()
  if (srcErr || !src) return { error: 'Community show not found' }

  // Already in their library? Return it (re-acquire is free).
  const { data: existing } = await admin
    .from('shows').select('id').eq('user_id', buyerId).eq('source_show_id', sourceShowId).limit(1).maybeSingle()
  if (existing) return { showId: existing.id }

  const { data: clone, error: cloneErr } = await admin.from('shows').insert({
    user_id: buyerId,
    name: src.name,
    tesla_model: targetModel,
    style: src.style,
    intensity: src.intensity,
    bpm: src.bpm,
    is_public: false,
    song_title: src.song_title,
    song_artist: src.song_artist,
    edit_data: src.edit_data,
    duration_sec: src.duration_sec,
    source_show_id: sourceShowId,
    share_token: crypto.randomUUID(),
  }).select('id').single()
  if (cloneErr || !clone) return { error: cloneErr?.message ?? 'Could not create your copy' }

  // BYOM (metadata-only community): the clone references the source's STORED
  // choreography (fseq_path) — its export reads that FSEQ directly, so NO audio is
  // copied or shared. The buyer brings their own copy of the song at export time.
  // (Defensive update so it no-ops cleanly until the shows.fseq_path column exists.)
  const srcFseq = (src as { fseq_path?: string | null }).fseq_path
  if (srcFseq) {
    await admin.from('shows').update({ fseq_path: srcFseq }).eq('id', clone.id).then(() => null, () => null)
  }

  return { showId: clone.id }
}
