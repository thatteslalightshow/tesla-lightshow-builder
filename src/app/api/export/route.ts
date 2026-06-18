import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAdminClient, getSignedDownloadUrl, type ShowStyle, type TeslaModel } from '@/lib/supabase'
import { getChannelCount } from '@/lib/tesla-channels'
import { sendExportDownload } from '@/lib/email'
import JSZip from 'jszip'

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}

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

function generateFrames(style: ShowStyle, intensity: number, bpm: number, frames: number, channels: number): Uint8Array[] {
  const scale = intensity / 100
  const beatsPerFrame = bpm / (60 * 20)
  return Array.from({ length: frames }, (_, f) => {
    const frame = new Uint8Array(channels)
    const t = f * beatsPerFrame
    for (let c = 0; c < channels; c++) {
      const zone = Math.floor(c / 3)
      let val = 0
      switch (style) {
        case 'energetic': val = Math.sin(t * Math.PI * 2 + zone * 0.8) > 0.2 ? 255 : 0; break
        case 'wave':      val = Math.round((Math.sin(t * Math.PI * 2 - zone * 0.5) * 0.5 + 0.5) * 255); break
        case 'strobe':    val = Math.floor(t) % 2 === 0 && f % 3 === 0 ? 255 : 0; break
        case 'chase':     val = zone === Math.floor(t) % Math.ceil(channels / 3) ? 255 : 0; break
      }
      frame[c] = Math.round(val * scale)
    }
    return frame
  })
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    admin.from('profiles').select('is_admin').eq('id', session.user.id).single(),
    admin.from('exports').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
    admin.from('subscriptions').select('status').eq('user_id', session.user.id).in('status', ['active', 'trialing']).maybeSingle(),
    admin.from('show_purchases').select('id').eq('user_id', session.user.id).eq('show_id', body.show_id).maybeSingle(),
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
    .from('shows').select('*').eq('id', body.show_id).eq('user_id', session.user.id).single()
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  // ── Load audio ────────────────────────────────────────────────────────────
  const { data: audioRecord } = await admin
    .from('audio_files').select('*').eq('show_id', body.show_id)
    .order('uploaded_at', { ascending: false }).limit(1).maybeSingle()

  let audioBytes: ArrayBuffer | null = null
  if (audioRecord) {
    const { data: audioData, error: dlErr } = await admin.storage
      .from('audio-files').download(audioRecord.storage_path)
    if (!dlErr && audioData) audioBytes = await audioData.arrayBuffer()
  }

  // ── Generate FSEQ ─────────────────────────────────────────────────────────
  const FPS = 20
  const durationSec = audioRecord?.duration_sec ?? show.duration_sec ?? 30
  const frames = Math.round(durationSec * FPS)
  const channels = getChannelCount(show.tesla_model as TeslaModel)
  const bpm = show.bpm ?? 120
  const frameData = generateFrames(show.style, show.intensity, bpm, frames, channels)
  const fseq = buildFseq(channels, frames, Math.round(1000 / FPS), frameData)

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  const zip = new JSZip()
  const folder = zip.folder('LightShow')!
  folder.file('lightshow.fseq', fseq)
  if (audioBytes) folder.file('lightshow.wav', audioBytes)
  folder.file('show_config.json', JSON.stringify({
    name: show.name, tesla_model: show.tesla_model,
    style: show.style, intensity: show.intensity,
    bpm, generated_at: new Date().toISOString(),
  }, null, 2))

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  // ── Upload ZIP ────────────────────────────────────────────────────────────
  const zipPath = `${session.user.id}/${body.show_id}/${Date.now()}.zip`
  const { error: zipUploadErr } = await admin.storage
    .from('fseq-exports').upload(zipPath, zipBuffer, { contentType: 'application/zip' })
  if (zipUploadErr) return NextResponse.json({ error: zipUploadErr.message }, { status: 500 })

  // ── Record export ─────────────────────────────────────────────────────────
  const { data: exportRecord } = await admin
    .from('exports').insert({
      user_id: session.user.id, show_id: body.show_id,
      audio_file_id: audioRecord?.id ?? null,
      zip_path: zipPath, file_size_bytes: zipBuffer.byteLength,
    }).select().single()

  // ── Deliver ───────────────────────────────────────────────────────────────
  const deliverByEmail = body.deliver_by_email === true
  const expirySec = deliverByEmail ? EMAIL_EXPIRY_SEC : DIRECT_EXPIRY_SEC
  const signedUrl = await getSignedDownloadUrl('fseq-exports', zipPath, expirySec)

  if (deliverByEmail && session.user.email) {
    await sendExportDownload({
      to: session.user.email,
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
