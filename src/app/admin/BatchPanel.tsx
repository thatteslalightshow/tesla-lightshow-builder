'use client'

import { useState } from 'react'
import { parseId3, titleFromFilename } from '@/lib/id3'
import { audioBufferToWav, resampleTo44100 } from '@/lib/wav'
import { analyzePCM } from '@/lib/audio-analysis'
import { MODELS, getChannelCount, STEP_MS } from '@/lib/tesla-channels'
import type { TeslaModel } from '@/lib/supabase'
import JSZip from 'jszip'

const MODEL_LIST = [
  { value: 'model3', label: 'Model 3' }, { value: 'modelY', label: 'Model Y' },
  { value: 'modelS', label: 'Model S' }, { value: 'modelX', label: 'Model X' },
  { value: 'cybertruck', label: 'Cybertruck' },
]
const MAX = 8
type Status = 'pending' | 'working' | 'done' | 'failed'

// PSEQ v2 FSEQ writer (same format as the server export).
function buildFseq(channels: number, frames: number, stepMs: number, frameData: Uint8Array[]): Uint8Array {
  const buf = new Uint8Array(32 + frames * channels)
  const view = new DataView(buf.buffer)
  buf[0] = 0x50; buf[1] = 0x53; buf[2] = 0x45; buf[3] = 0x51
  view.setUint16(4, 32, true); buf[6] = 0; buf[7] = 2; view.setUint16(8, 32, true)
  view.setUint32(10, channels, true); view.setUint32(14, frames, true); view.setUint16(18, stepMs, true)
  for (let f = 0; f < frames; f++) buf.set(frameData[f] ?? new Uint8Array(channels), 32 + f * channels)
  return buf
}
function sanitize(name: string): string {
  return (name || 'lightshow').replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'lightshow'
}

// Admin/tester batch tool — runs ENTIRELY in the browser: decode any format, analyze with the
// same engine the builder uses, build each FSEQ + 44.1kHz WAV, and zip them up locally. No
// upload, no server limits. Each pair is named "Title-Artist" so it pairs on a USB. Not customer-facing.
export default function BatchPanel() {
  const [files, setFiles] = useState<File[]>([])
  const [model, setModel] = useState<TeslaModel>('model3')
  const [busy, setBusy] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [detected, setDetected] = useState<Record<string, string>>({})   // per-file auto-detected vibe
  const [msg, setMsg] = useState('')

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files ?? []).slice(0, MAX)
    setFiles(fs); setStatuses({}); setDetected({}); setMsg(fs.length >= MAX ? `Max ${MAX} per batch.` : '')
  }

  async function run() {
    if (!files.length || busy) return
    setBusy(true); setMsg('Building shows…')
    const def = MODELS[model]; const channels = getChannelCount(model)
    const zip = new JSZip(); const used = new Set<string>(); let ok = 0
    const vibeMix: Record<string, number> = {}
    const st: Record<string, Status> = {}; files.forEach(f => { st[f.name] = 'pending' }); setStatuses({ ...st })
    const det: Record<string, string> = {}; setDetected({})

    for (const f of files) {
      st[f.name] = 'working'; setStatuses({ ...st })
      await new Promise(r => setTimeout(r, 20))   // let the UI paint the status
      try {
        const tags = await parseId3(f)
        const title = tags.title?.trim() || titleFromFilename(f.name)
        const baseName = tags.artist?.trim() ? `${title}-${tags.artist.trim()}` : title
        const ctx = new AudioContext()
        let ab: AudioBuffer
        try { ab = await ctx.decodeAudioData((await f.arrayBuffer()).slice(0)) } finally { ctx.close() }
        const ab44 = await resampleTo44100(ab)
        const wavBlob = audioBufferToWav(ab44)
        const L = ab44.getChannelData(0); const R = ab44.numberOfChannels > 1 ? ab44.getChannelData(1) : L
        // AUTO-VIBE: first pass reads the audio-derived vibe (same classifyVibe the customer builder uses),
        // then build the final show with that vibe — so a batch gets the right mix per song, not all 'balanced'.
        // suggestedPreset is independent of the preset passed in, so pass 1 doubles as the 'balanced' build.
        const first = analyzePCM(L, R, ab44.sampleRate, def.zones, channels, { autoClosures: true, model, preset: 'balanced' })
        const vibe = first.suggestedPreset
        const frames = vibe === 'balanced'
          ? first.frames
          : analyzePCM(L, R, ab44.sampleRate, def.zones, channels, { autoClosures: true, model, preset: vibe }).frames
        vibeMix[vibe] = (vibeMix[vibe] ?? 0) + 1
        det[f.name] = vibe; setDetected({ ...det })
        const fseq = buildFseq(channels, frames.length, Math.round(STEP_MS), frames)
        const labeled = `${baseName} [${vibe}]`                          // vibe in the name so the USB/ear-test shows what each song got
        let name = sanitize(labeled); let i = 2
        while (used.has(name.toLowerCase())) name = `${sanitize(labeled)} (${i++})`
        used.add(name.toLowerCase())
        zip.file(`${name}.fseq`, fseq)
        zip.file(`${name}.wav`, wavBlob)
        ok++; st[f.name] = 'done'; setStatuses({ ...st })
      } catch { st[f.name] = 'failed'; setStatuses({ ...st }) }
    }

    if (!ok) { setMsg('All songs failed to process.'); setBusy(false); return }
    setMsg('Zipping…')
    try {
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `batch_${model}.zip`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 15000)
      const mix = Object.entries(vibeMix).sort((p, q) => q[1] - p[1]).map(([v, n]) => `${n} ${v}`).join(', ')
      setMsg(`✓ ${ok} show${ok === 1 ? '' : 's'} exported (${mix}). ZIP downloaded.`)
    } catch { setMsg('Could not build the ZIP.') }
    setBusy(false)
  }

  const dot = (s: Status) => s === 'done' ? 'var(--green)' : s === 'failed' ? '#ff8a8a' : s === 'working' ? '#ff8c00' : 'var(--muted2)'
  const input: React.CSSProperties = { padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }

  return (
    <div style={{ padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ ...input }}>
          <input type="file" accept="audio/*,video/mp4,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.flac" multiple onChange={onPick} style={{ display: 'none' }} disabled={busy} />
          {files.length ? `${files.length} song${files.length === 1 ? '' : 's'} selected` : 'Choose songs…'}
        </label>
        <select value={model} onChange={e => setModel(e.target.value as TeslaModel)} disabled={busy} style={{ ...input }}>
          {MODEL_LIST.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button onClick={run} disabled={busy || !files.length} className="btn btn-primary btn-sm">
          {busy ? 'Working…' : 'Process & export →'}
        </button>
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map(f => (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot(statuses[f.name] ?? 'pending'), flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              {detected[f.name] && <span style={{ flexShrink: 0, marginLeft: 'auto', padding: '1px 7px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--muted2)' }}>{detected[f.name]}</span>}
            </div>
          ))}
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? 'var(--green)' : msg.includes('fail') || msg.includes('Max') || msg.includes('Could not') ? '#ff8a8a' : 'var(--muted)' }}>{msg}</div>}
    </div>
  )
}
