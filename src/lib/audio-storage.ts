import { getAdminClient } from './supabase'

type Admin = ReturnType<typeof getAdminClient>

// Ref-count-safe removal of a show's uploaded audio (BYOM retention — see
// byom-positioning). Removes the storage object(s) that NO OTHER show references
// (hybrid storage protects shared files), detaches any export rows that point at
// them so the FK can't block the delete, then drops this show's audio_files rows.
// Used by: delete-on-export (customers only) + show deletion. Best-effort; never
// throws — callers wrap in catch so the main flow is never broken by cleanup.
export async function deleteShowAudio(admin: Admin, showId: string): Promise<void> {
  const { data: rows } = await admin.from('audio_files').select('id, storage_path').eq('show_id', showId)
  if (!rows || !rows.length) return

  const ids = rows.map((r: { id: string }) => r.id)
  const paths = [...new Set(rows.map((r: { storage_path: string | null }) => r.storage_path).filter(Boolean) as string[])]

  // Detach export records so the audio_files delete isn't blocked by an FK.
  await admin.from('exports').update({ audio_file_id: null }).in('audio_file_id', ids).then(() => {}, () => {})

  // Only remove storage objects no OTHER show still references.
  if (paths.length) {
    const { data: otherRefs } = await admin
      .from('audio_files').select('storage_path').in('storage_path', paths).neq('show_id', showId)
    const shared = new Set((otherRefs ?? []).map((r: { storage_path: string }) => r.storage_path))
    const removable = paths.filter(p => !shared.has(p))
    if (removable.length) await admin.storage.from('audio-files').remove(removable)
  }

  await admin.from('audio_files').delete().eq('show_id', showId)
}
