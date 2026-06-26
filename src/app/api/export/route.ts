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

// Read a WAV header's sample rate + data duration without decoding the audio.
function wavInfo(buf: ArrayBuffer): { sampleRate: number; durationSec: number } | null {
  if (buf.byteLength < 44) return null
  const dv = new DataView(buf)
  if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null // "RIFF"/"WAVE"
  let off = 12, sampleRate = 0, byteRate = 0, dataSize = 0, haveFmt = false
  while (off + 8 <= dv.byteLength) {
    const id = dv.getUint32(off, false), sz = dv.getUint32(off + 4, true)
    if (id === 0x666d7420) { sampleRate = dv.getUint32(off + 12, true); byteRate = dv.getUint32(off + 16, true); haveFmt = true }
    else if (id === 0x64617461) { dataSize = sz }
    off += 8 + sz + (sz & 1)
  }
  if (!haveFmt || sampleRate === 0) return null
  return { sampleRate, durationSec: byteRate > 0 ? dataSize / byteRate : 0 }
}

// 44.1kHz resampler + WAV encoder — used ONLY for admin/tester QA builds, which
// bundle the audio so it's ready to run on the car. Customer exports are FSEQ-only
// (BYOM) and never touch these. See byom-positioning.
function resamplePCM(data: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return data
  const ratio = srcRate / dstRate
  const outLen = Math.max(1, Math.round(data.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio, i0 = Math.floor(pos), i1 = Math.min(i0 + 1, data.length - 1)
    const frac = pos - i0
    out[i] = data[i0] * (1 - frac) + data[i1] * frac
  }
  return out
}
function encodeWav(L: Float32Array, R: Float32Array, sampleRate: number): Uint8Array {
  const numFrames = Math.min(L.length, R.length)
  const blockAlign = 2 * 2 // 2ch * 16-bit
  const dataSize = numFrames * blockAlign
  const out = new Uint8Array(44 + dataSize)
  const view = new DataView(out.buffer)
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true)
  writeStr(36, 'data'); view.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < numFrames; i++) {
    let l = Math.max(-1, Math.min(1, L[i])); l = l < 0 ? l * 0x8000 : l * 0x7fff
    let r = Math.max(-1, Math.min(1, R[i])); r = r < 0 ? r * 0x8000 : r * 0x7fff
    view.setInt16(off, l, true); off += 2
    view.setInt16(off, r, true); off += 2
  }
  return out
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

  // ── Load show + authorization (in one round-trip) ─────────────────────────
  const [
    { data: show, error: showErr },
    { data: profile },
    { count: exportCount },
    { data: subscription },
    { data: purchase },
  ] = await Promise.all([
    admin.from('shows').select('*').eq('id', body.show_id).eq('user_id', user.id).single(),
    admin.from('profiles').select('is_admin').eq('id', user.id).single(),
    admin.from('exports').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('subscriptions').select('status').eq('user_id', user.id).in('status', ['active', 'trialing']).maybeSingle(),
    admin.from('show_purchases').select('id').eq('user_id', user.id).eq('show_id', body.show_id).maybeSingle(),
  ])
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  const isAdmin = profile?.is_admin === true
  const isSubscribed = !!subscription
  const hasPaid = !!purchase
  const isFreeExport = (exportCount ?? 0) === 0
  // A show acquired from the community was already paid for at acquisition time.
  const isAcquired = !!show.source_show_id

  if (!isAdmin && !isSubscribed && !hasPaid && !isFreeExport && !isAcquired) {
    return NextResponse.json({ error: 'subscription_required' }, { status: 402 })
  }

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

  // ── Generate FSEQ + guarantee 44.1kHz WAV audio ───────────────────────────
  const channels = getChannelCount(show.tesla_model as TeslaModel)
  const bpm = show.bpm ?? 120
  const modelDef = MODELS[show.tesla_model as TeslaModel]
  const editData = show.edit_data as EditData | null

  // Tesla needs 44.1kHz audio or the show drifts out of sync. The browser
  // converts on upload, but that can fail — so the SERVER is the source of
  // truth. Decode the stored audio once (reused for analysis), then ship a
  // 44.1kHz WAV: pass through if it already is one, else transcode the PCM.
  const wav = audioBytes ? wavInfo(audioBytes) : null
  const storedIsWav44 = wav?.sampleRate === 44100
  // Decode when needed for analysis (no manual edits) OR to transcode the audio.
  const audio = audioBytes && (!hasEdits(editData) || !storedIsWav44)
    ? await decodeAudioPCM(audioBytes) : null

  // Show length: prefer the real decoded length, else the WAV header, else stored.
  const durationSec = (audio ? audio.L.length / audio.sampleRate : null)
    ?? (wav && wav.durationSec > 0 ? wav.durationSec : null)
    ?? audioRecord?.duration_sec ?? show.duration_sec ?? 30

  // Priority: manual timeline edits > music-reactive analysis > generic style.
  let frameData: Uint8Array[]
  if (hasEdits(editData)) {
    const frames = Math.round(durationSec * FPS)
    const loop = buildEditFrames(editData!, bpm, channels)
    frameData = Array.from({ length: frames }, (_, f) => loop[f % loop.length])
  } else if (audio) {
    const autoClosures = editData?.autoClosures === true
    frameData = analyzePCM(audio.L, audio.R, audio.sampleRate, modelDef.zones, channels,
      { autoClosures, model: show.tesla_model as TeslaModel, preset: editData?.mixPreset }).frames
  } else {
    frameData = generateFrames(show.style, show.intensity, bpm, Math.round(durationSec * FPS), modelDef)
  }
  const fseq = buildFseq(channels, frameData.length, Math.round(STEP_MS), frameData)

  // ── BYOM: ship the choreography ONLY (the .fseq + a setup README). The customer
  // brings their own copy of the song — we never redistribute the audio. The
  // README carries the locked BYOM voice (see byom-positioning in memory).
  const songLabel = show.song_title
    ? `"${show.song_title}"${show.song_artist ? ` — ${show.song_artist}` : ''}`
    : 'your song'
  const readme = [
    `THAT LIGHTSHOW  —  your show is ready`,
    `Choreography by us. Soundtrack by you.`,
    ``,
    `IN THIS FOLDER`,
    `  - lightshow.fseq   (your custom light show)`,
    ``,
    `ONE LAST STEP - ADD YOUR MUSIC`,
    `  1. Find your copy of ${songLabel} - the same file you uploaded works perfectly.`,
    `  2. Rename it to:   lightshow.wav   (or  lightshow.mp3)`,
    `  3. Make sure it's 44.1 kHz so it stays perfectly in sync (most MP3s already are).`,
    `  4. Put it in this LightShow folder, right next to lightshow.fseq.`,
    `  5. Copy the whole LightShow folder to a USB drive (formatted exFAT or FAT32).`,
    `  6. In your Tesla: Toybox -> Light Show -> Schedule Show. Enjoy.`,
    ``,
    `WHY DO YOU ADD THE SONG YOURSELF?`,
    `The music belongs to the artists who made it - and we'd rather honor the`,
    `copyright that protects their work than tiptoe around it. So you bring your own`,
    `copy of the track, and we'll make your Tesla do it justice. It keeps your show`,
    `100% legal, 100% yours, and everyone on the right side of the music.`,
    ``,
    `Questions?  thatteslalightshow.com`,
    ``,
  ].join('\r\n')

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  // Customers: FSEQ + README only (BYOM — never redistribute audio).
  // Admin/tester accounts (is_admin): bundle the audio too, as a 44.1kHz WAV, so
  // QA gets a ready-to-run drive without the BYOM steps. This path NEVER reaches
  // customers — it's gated on the server-verified is_admin flag.
  const zip = new JSZip()
  const folder = zip.folder('LightShow')!
  folder.file('lightshow.fseq', fseq)

  if (isAdmin) {
    let shipped: { data: ArrayBuffer | Uint8Array; ext: 'wav' | 'mp3' } | null = null
    if (storedIsWav44 && audioBytes) {
      shipped = { data: audioBytes, ext: 'wav' }                        // already 44.1kHz WAV — pass through
    } else if (audio) {
      const L = audio.sampleRate === 44100 ? audio.L : resamplePCM(audio.L, audio.sampleRate, 44100)
      const R = audio.sampleRate === 44100 ? audio.R : resamplePCM(audio.R, audio.sampleRate, 44100)
      shipped = { data: encodeWav(L, R, 44100), ext: 'wav' }            // transcoded to 44.1kHz
    } else if (audioBytes) {
      const head = new Uint8Array(audioBytes.slice(0, 4))               // undecodable — last resort
      const isWavHdr = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46
      shipped = { data: audioBytes, ext: isWavHdr ? 'wav' : 'mp3' }
    }
    if (shipped) folder.file(`lightshow.${shipped.ext}`, shipped.data)
    folder.file('README.txt', `QA / tester build — audio bundled (is_admin account). This is NOT the customer FSEQ-only output.\r\n`)
  } else {
    folder.file('README.txt', readme)                                  // customer BYOM build
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
      songTitle: show.song_title ?? undefined,
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
