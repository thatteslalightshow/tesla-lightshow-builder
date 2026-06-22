import { NextResponse } from 'next/server'
import { getAdminClient, type TeslaModel } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'
import { getChannelCount, generateFrames, buildEditFrames, hasEdits, MODELS, FPS, STEP_MS, type EditData } from '@/lib/tesla-channels'
import { analyzePCM } from '@/lib/audio-analysis'
import { sendExportDownload } from '@/lib/email'
import { MPEGDecoder } from 'mpg123-decoder'
import JSZip from 'jszip'

// Decode a 16-bit PCM WAV into L/R sample data so the SAME spectral analysis that
// drives the live preview also drives the exported file (matches the song on-car).
function decodeWavPCM(buf: ArrayBuffer): { L: Float32Array; R: Float32Array; sampleRate: number } | null {
  const dv = new DataView(buf)
  if (dv.byteLength < 44 || dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null
  let off = 12, channels = 0, sampleRate = 0, bits = 0, dataOff = -1, dataLen = 0
  while (off + 8 <= dv.byteLength) {
    const id = dv.getUint32(off, false), sz = dv.getUint32(off + 4, true)
    if (id === 0x666d7420) { channels = dv.getUint16(off + 10, true); sampleRate = dv.getUint32(off + 12, true); bits = dv.getUint16(off + 22, true) }
    else if (id === 0x64617461) { dataOff = off + 8; dataLen = sz }
    off += 8 + sz + (sz & 1)
  }
  if (dataOff < 0 || bits !== 16 || channels < 1 || sampleRate < 8000) return null
  const n = Math.floor(dataLen / 2 / channels)
  const L = new Float32Array(n), R = new Float32Array(n)
  let p = dataOff
  for (let i = 0; i < n; i++) {
    L[i] = dv.getInt16(p, true) / 32768; p += 2
    if (channels > 1) { R[i] = dv.getInt16(p, true) / 32768; p += 2 } else R[i] = L[i]
  }
  return { L, R, sampleRate }
}

// Decode the show audio (WAV or MP3) to L/R PCM so EVERY export is music-reactive,
// not just WAV-stored ones. MP3 via a WASM decoder (works in the serverless runtime).
async function decodeAudioPCM(bytes: ArrayBuffer): Promise<{ L: Float32Array; R: Float32Array; sampleRate: number } | null> {
  const wav = decodeWavPCM(bytes)
  if (wav) return wav
  try {
    const dec = new MPEGDecoder()
    await dec.ready
    const { channelData, samplesDecoded, sampleRate } = dec.decode(new Uint8Array(bytes))
    dec.free()
    if (samplesDecoded > 0 && channelData?.[0]?.length) {
      return { L: channelData[0], R: channelData[1] ?? channelData[0], sampleRate }
    }
  } catch { /* not decodable → fall back to style */ }
  return null
}

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}

// Bundling a full-song audio file into the zip (download + zip + re-upload of
// ~10MB) can take a while; give the function room so it doesn't time out and
// drop the client into the audio-less fallback path.
export const maxDuration = 120

// Signed URL TTL: 1 hour for email delivery, 15 min for direct download
const EMAIL_EXPIRY_SEC = 3600
const DIRECT_EXPIRY_SEC = 900

function buildFseq(channels: number, frames: number, stepMs: number, frameData: Uint8Array[]): Uint8Array {
  const headerSize = 32
  const buf = new Uint8Array(headerSize + frames * channels)
  const view = new DataView(buf.buffer)
  buf[0] = 0x50; buf[1] = 0x53; buf[2] = 0x45; buf[3] = 0x51
  view.setUint16(4, headerSize, true)
  buf[6] = 0; buf[7] = 2
  view.setUint16(8, headerSize, true)
  view.setUint32(10, channels, true)
  view.setUint32(14, frames, true)
  view.setUint16(18, stepMs, true)
  for (let f = 0; f < frames; f++) {
    buf.set(frameData[f] ?? new Uint8Array(channels), headerSize + f * channels)
  }
  return buf
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id: string; deliver_by_email?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  const admin = getAdminClient()

  // ── Authorization check ──────────────────────────────────────────────────
  const [
    { data: profile },
    { count: exportCount },
    { data: subscription },
    { data: purchase },
  ] = await Promise.all([
    admin.from('profiles').select('is_admin').eq('id', user.id).single(),
    admin.from('exports').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('subscriptions').select('status').eq('user_id', user.id).in('status', ['active', 'trialing']).maybeSingle(),
    admin.from('show_purchases').select('id').eq('user_id', user.id).eq('show_id', body.show_id).maybeSingle(),
  ])

  const isAdmin = profile?.is_admin === true
  const isSubscribed = !!subscription
  const hasPaid = !!purchase
  const isFreeExport = (exportCount ?? 0) === 0

  if (!isAdmin && !isSubscribed && !hasPaid && !isFreeExport) {
    return NextResponse.json({ error: 'subscription_required' }, { status: 402 })
  }

  // ── Load show ─────────────────────────────────────────────────────────────
  const { data: show, error: showErr } = await admin
    .from('shows').select('*').eq('id', body.show_id).eq('user_id', user.id).single()
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  // ── Load audio (each show has at most one row; no fragile column ordering) ──
  const { data: audioRows } = await admin
    .from('audio_files').select('*').eq('show_id', body.show_id).limit(1)
  const audioRecord = audioRows?.[0] ?? null

  let audioBytes: ArrayBuffer | null = null
  if (audioRecord?.storage_path) {
    const { data: audioData, error: dlErr } = await admin.storage
      .from('audio-files').download(audioRecord.storage_path)
    if (!dlErr && audioData) audioBytes = await audioData.arrayBuffer()
  }

  // ── Generate FSEQ ─────────────────────────────────────────────────────────
  // Prefer the audio's REAL length so the fseq matches the song. For our WAVs
  // (canonical 44-byte header) duration = dataSize / byteRate, no decoding needed.
  let wavDurationSec: number | null = null
  if (audioBytes && audioBytes.byteLength > 44) {
    const head = new Uint8Array(audioBytes.slice(0, 4))
    if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) { // "RIFF"
      const dv = new DataView(audioBytes)
      const byteRate = dv.getUint32(28, true)
      const dataSize = dv.getUint32(40, true)
      if (byteRate > 0 && dataSize > 0) wavDurationSec = dataSize / byteRate
    }
  }
  const durationSec = wavDurationSec ?? audioRecord?.duration_sec ?? show.duration_sec ?? 30
  const channels = getChannelCount(show.tesla_model as TeslaModel)
  const bpm = show.bpm ?? 120
  const modelDef = MODELS[show.tesla_model as TeslaModel]

  // Priority: manual timeline edits > music-reactive analysis (from the WAV) >
  // generic style. The analysis is the SAME engine the live preview uses, so the
  // exported file matches what the user heard/saw.
  const editData = show.edit_data as EditData | null
  let frameData: Uint8Array[]
  if (hasEdits(editData)) {
    const frames = Math.round(durationSec * FPS)
    const loop = buildEditFrames(editData!, bpm, channels)
    frameData = Array.from({ length: frames }, (_, f) => loop[f % loop.length])
  } else {
    const audio = audioBytes ? await decodeAudioPCM(audioBytes) : null
    if (audio) {
      const autoClosures = editData?.autoClosures === true
      frameData = analyzePCM(audio.L, audio.R, audio.sampleRate, modelDef.zones, channels,
        { autoClosures, model: show.tesla_model as TeslaModel }).frames
    } else {
      frameData = generateFrames(show.style, show.intensity, bpm, Math.round(durationSec * FPS), modelDef)
    }
  }
  const fseq = buildFseq(channels, frameData.length, Math.round(STEP_MS), frameData)

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  const zip = new JSZip()
  const folder = zip.folder('LightShow')!
  folder.file('lightshow.fseq', fseq)
  if (audioBytes) {
    // Tesla accepts .mp3 or .wav, and the audio filename must match the fseq.
    // Ship the file with the extension matching its REAL format (detected from
    // the bytes), so an uploaded MP3 isn't mislabeled as .wav and rejected.
    const head = new Uint8Array(audioBytes.slice(0, 4))
    const isWav = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 // "RIFF"
    folder.file(`lightshow.${isWav ? 'wav' : 'mp3'}`, audioBytes)
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  // ── Upload ZIP ────────────────────────────────────────────────────────────
  const zipPath = `${user.id}/${body.show_id}/${Date.now()}.zip`
  const { error: zipUploadErr } = await admin.storage
    .from('fseq-exports').upload(zipPath, zipBuffer, { contentType: 'application/zip' })
  if (zipUploadErr) return NextResponse.json({ error: zipUploadErr.message }, { status: 500 })

  // ── Record export ─────────────────────────────────────────────────────────
  const { data: exportRecord, error: exportInsertErr } = await admin
    .from('exports').insert({
      user_id: user.id, show_id: body.show_id,
      audio_file_id: audioRecord?.id ?? null,
      // The export is bundled as a single zip; fseq_path is NOT NULL in the
      // schema, so point it at the same zip rather than leaving it empty
      // (an empty insert silently broke export tracking and free-export gating).
      fseq_path: zipPath,
      zip_path: zipPath, file_size_bytes: zipBuffer.byteLength,
    }).select().single()
  if (exportInsertErr) console.error('export insert failed:', exportInsertErr.message)

  // ── Deliver ───────────────────────────────────────────────────────────────
  const deliverByEmail = body.deliver_by_email === true
  const expirySec = deliverByEmail ? EMAIL_EXPIRY_SEC : DIRECT_EXPIRY_SEC
  // Sign with the admin (service-role) client — the private fseq-exports bucket
  // isn't readable by the anon client, so the shared getSignedDownloadUrl helper
  // (which uses the browser client) threw here and 500'd the whole export.
  const { data: signed, error: signErr } = await admin.storage
    .from('fseq-exports').createSignedUrl(zipPath, expirySec)
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? 'Could not create download URL' }, { status: 500 })
  }
  const signedUrl = signed.signedUrl

  if (deliverByEmail && user.email) {
    await sendExportDownload({
      to: user.email,
      showName: show.name,
      model: MODEL_LABELS[show.tesla_model] ?? 'Tesla',
      downloadUrl: signedUrl,
      expiresMinutes: expirySec / 60,
    }).catch(() => null)
  }

  const safeName = show.name.replace(/\s+/g, '_')
  return NextResponse.json({
    url: signedUrl,
    filename: `${safeName}_lightshow.zip`,
    export_id: exportRecord?.id ?? null,
    file_size_bytes: zipBuffer.byteLength,
    delivered_by_email: deliverByEmail,
  })
}
