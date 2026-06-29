import { NextResponse } from 'next/server'
import { getAdminClient, type TeslaModel } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'
import { analyzePCM } from '@/lib/audio-analysis'
import { getChannelCount, MODELS, STEP_MS } from '@/lib/tesla-channels'
import { decodeAudioPCM, resamplePCM, encodeWav, buildFseq, sanitizeBaseName } from '@/lib/audio-server'
import JSZip from 'jszip'

export const maxDuration = 300
const MAX_ITEMS = 8

// Admin/tester batch export: turn several uploaded songs into one ZIP of FSEQ+WAV pairs,
// each pair sharing the same "Title-Artist" name (so they can sit on one USB for testing).
// Full shows (autoClosures on). Temp audio is deleted after processing.
export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = getAdminClient()
  const { data: prof } = await admin.from('profiles').select('is_admin, is_tester').eq('id', user.id).single()
  if (!prof?.is_admin && !prof?.is_tester) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { model?: string; items?: { path: string; baseName: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const model = (body.model && body.model in MODELS ? body.model : 'model3') as TeslaModel
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : []
  if (!items.length) return NextResponse.json({ error: 'No songs provided' }, { status: 400 })

  const def = MODELS[model]
  const channels = getChannelCount(model)
  const zip = new JSZip()
  const used = new Set<string>()
  const cleanup: string[] = []
  const failures: string[] = []
  let ok = 0

  for (const it of items) {
    // Only ever touch this user's own batch uploads.
    if (typeof it.path !== 'string' || !it.path.startsWith(`batch/${user.id}/`)) { failures.push(it.baseName || 'unknown'); continue }
    cleanup.push(it.path)
    try {
      const { data: blob, error } = await admin.storage.from('audio-files').download(it.path)
      if (error || !blob) { failures.push(it.baseName); continue }
      const audio = await decodeAudioPCM(await blob.arrayBuffer())
      if (!audio) { failures.push(it.baseName); continue }
      const frames = analyzePCM(audio.L, audio.R, audio.sampleRate, def.zones, channels, { autoClosures: true, model, preset: 'balanced' }).frames
      const fseq = buildFseq(channels, frames.length, Math.round(STEP_MS), frames)
      const L = audio.sampleRate === 44100 ? audio.L : resamplePCM(audio.L, audio.sampleRate, 44100)
      const R = audio.sampleRate === 44100 ? audio.R : resamplePCM(audio.R, audio.sampleRate, 44100)
      const wav = encodeWav(L, R, 44100)
      // Unique base name so two songs can't collide.
      const base = sanitizeBaseName(it.baseName)
      let name = base, i = 2
      while (used.has(name.toLowerCase())) name = `${base} (${i++})`
      used.add(name.toLowerCase())
      zip.file(`${name}.fseq`, fseq)
      zip.file(`${name}.wav`, wav)
      ok++
    } catch { failures.push(it.baseName) }
  }

  if (cleanup.length) await admin.storage.from('audio-files').remove(cleanup).then(() => null, () => null)
  if (ok === 0) return NextResponse.json({ error: 'No songs could be processed', failures }, { status: 422 })

  zip.file('README.txt', `Admin/tester batch — ${ok} show(s) for ${model}.\r\nEach pair (NAME.fseq + NAME.wav) shares the same name so it pairs on a USB.\r\n`)
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const zipPath = `${user.id}/batch/${Date.now()}.zip`
  const up = await admin.storage.from('fseq-exports').upload(zipPath, zipBuf, { contentType: 'application/zip' })
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
  const { data: signed } = await admin.storage.from('fseq-exports').createSignedUrl(zipPath, 7 * 24 * 3600)
  return NextResponse.json({ url: signed?.signedUrl ?? null, count: ok, failures })
}
