import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'

// Listing + moving files can take a moment on a large bucket.
export const maxDuration = 60

const BUCKET = 'audio-files'
const TRASH = 'trash'           // soft-deleted files live here for 30 days
const TRASH_RETENTION_MS = 30 * 86400000

type Mode = 'dry_run' | 'soft_delete' | 'hard_delete'

// Recursively list every file in the bucket (Supabase list is per-prefix), with
// size + created_at. Skips the trash/ prefix and empty-folder placeholders.
async function listAllFiles(admin: ReturnType<typeof getAdminClient>, prefix = ''): Promise<{ path: string; size: number; createdAt: number }[]> {
  const out: { path: string; size: number; createdAt: number }[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error || !data || data.length === 0) break
    for (const e of data) {
      if (e.name === '.emptyFolderPlaceholder') continue
      const full = prefix ? `${prefix}/${e.name}` : e.name
      if (prefix === '' && e.name === TRASH) continue        // never sweep the trash
      if (e.id === null) {
        out.push(...await listAllFiles(admin, full))           // folder → recurse
      } else {
        out.push({ path: full, size: (e.metadata?.size as number) ?? 0, createdAt: new Date(e.created_at).getTime() })
      }
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return out
}

async function runSweep(mode: Mode, graceDays: number, triggeredBy: string | null) {
  const admin = getAdminClient()

  // Every storage path referenced by a show (the absolute keep-set).
  const { data: refs } = await admin.from('audio_files').select('storage_path')
  const referenced = new Set((refs ?? []).map(r => r.storage_path as string))

  const all = await listAllFiles(admin)
  const cutoff = Date.now() - graceDays * 86400000
  // Orphan = no show references it AND it's older than the grace window.
  const orphans = all.filter(f => !referenced.has(f.path) && f.createdAt < cutoff)
  const bytesFound = orphans.reduce((s, f) => s + f.size, 0)

  let filesRemoved = 0, bytesRemoved = 0
  if (mode !== 'dry_run' && orphans.length) {
    const paths = orphans.map(o => o.path)
    if (mode === 'soft_delete') {
      for (const p of paths) await admin.storage.from(BUCKET).copy(p, `${TRASH}/${p}`).then(() => null, () => null)
    }
    const { data: removed } = await admin.storage.from(BUCKET).remove(paths)
    filesRemoved = removed?.length ?? paths.length
    bytesRemoved = bytesFound
  }

  // Purge trash older than 30 days on any live run (completes the soft-delete cycle).
  if (mode !== 'dry_run') {
    const trash = await listAllFiles(admin, TRASH).catch(() => [])
    const expired = trash.filter(f => f.createdAt < Date.now() - TRASH_RETENTION_MS).map(f => f.path)
    if (expired.length) await admin.storage.from(BUCKET).remove(expired).then(() => null, () => null)
  }

  const report = {
    mode, graceDays,
    orphansFound: orphans.length, bytesFound,
    filesRemoved, bytesRemoved,
    totalFilesScanned: all.length,
    sample: orphans.slice(0, 25).map(o => ({ path: o.path, sizeMB: +(o.size / 1048576).toFixed(2) })),
  }

  await admin.from('storage_sweeps').insert({
    mode, bucket: BUCKET,
    orphans_found: orphans.length, bytes_found: bytesFound,
    files_removed: filesRemoved, bytes_removed: bytesRemoved,
    grace_days: graceDays,
    detail: { sample: report.sample, totalScanned: all.length },
    triggered_by: triggeredBy,
  }).then(() => null, () => null)

  return report
}

// Cron (Vercel) → scheduled dry-run report only. Protected by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const report = await runSweep('dry_run', 7, null)
  return NextResponse.json(report)
}

// Admin (manual) → can run dry_run / soft_delete / hard_delete after reviewing.
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = getAdminClient()
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { mode?: Mode; graceDays?: number }
  try { body = await req.json() } catch { body = {} }
  const mode: Mode = body.mode === 'soft_delete' || body.mode === 'hard_delete' ? body.mode : 'dry_run'
  const graceDays = Math.max(1, body.graceDays ?? 7)

  const report = await runSweep(mode, graceDays, user.id)
  return NextResponse.json(report)
}
