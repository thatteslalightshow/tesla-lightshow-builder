'use client'

import { useRef, useState } from 'react'
import { moderateFrames } from '@/lib/clip-moderation'

// Shareable-clip studio — turn a phone video of YOUR Tesla running a show into a branded 9:16 clip for
// TikTok/Reels/Stories. Everything runs in the browser: the video is NEVER uploaded (BYOM-safe, zero
// storage), an on-device guardrail confirms it's real, on-brand car footage, and we composite branding +
// export locally. See src/lib/clip-moderation.ts for the guardrail.

type Stage = 'idle' | 'checking' | 'rejected' | 'ready' | 'recording' | 'done'
const OUT_W = 1080, OUT_H = 1920, MAX_SEC = 30

// Grab `count` evenly-spaced frames from a loaded video as small canvases for the moderation check.
async function sampleFrames(video: HTMLVideoElement, count: number): Promise<HTMLCanvasElement[]> {
  const out: HTMLCanvasElement[] = []
  const dur = Math.max(0.1, video.duration || 1)
  for (let i = 0; i < count; i++) {
    const t = (dur * (i + 0.5)) / count
    await new Promise<void>(res => { const on = () => { video.removeEventListener('seeked', on); res() }; video.addEventListener('seeked', on); video.currentTime = Math.min(t, dur - 0.05) })
    const c = document.createElement('canvas')
    c.width = 224; c.height = 224
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
    out.push(c)
  }
  video.currentTime = 0
  return out
}

// cover-fit a source rect into the 9:16 frame
function coverRect(sw: number, sh: number): { dx: number; dy: number; dw: number; dh: number } {
  const scale = Math.max(OUT_W / sw, OUT_H / sh)
  const dw = sw * scale, dh = sh * scale
  return { dx: (OUT_W - dw) / 2, dy: (OUT_H - dh) / 2, dw, dh }
}

export default function ClipStudio() {
  const [stage, setStage] = useState<Stage>('idle')
  const [msg, setMsg] = useState('')
  const [caption, setCaption] = useState('')
  const [fileName, setFileName] = useState('')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [downloadName, setDownloadName] = useState('tesla-lightshow-clip.webm')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setDownloadUrl(null); setFileName(file.name)
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.preload = 'auto'
    video.src = URL.createObjectURL(file)
    videoRef.current = video
    setStage('checking'); setMsg('Loading your video…')
    try {
      await new Promise<void>((res, rej) => { video.onloadeddata = () => res(); video.onerror = () => rej(new Error('Could not read that video file.')) })
      setMsg('Checking the footage on your device (nothing is uploaded)…')
      const frames = await sampleFrames(video, 5)
      const mod = await moderateFrames(frames)
      if (!mod.ok) { setStage('rejected'); setMsg(mod.reason ?? 'This video can\'t be used.'); return }
      setStage('ready'); setMsg('Looks good — add a caption and export your clip.')
    } catch (err) {
      setStage('rejected'); setMsg(err instanceof Error ? err.message : 'Something went wrong reading the video.')
    }
  }

  async function exportClip() {
    const video = videoRef.current
    if (!video) return
    setStage('recording'); setMsg('Rendering your clip…'); setDownloadUrl(null)
    const canvas = document.createElement('canvas'); canvas.width = OUT_W; canvas.height = OUT_H
    const ctx = canvas.getContext('2d')!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cStream = (canvas as any).captureStream(30) as MediaStream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vStream = (video as any).captureStream ? (video as any).captureStream() as MediaStream : null
    const audio = vStream?.getAudioTracks?.() ?? []
    const mixed = new MediaStream([...cStream.getVideoTracks(), ...audio])
    // Prefer MP4 (H.264) — what TikTok/Instagram want — when the browser can record it; else WebM.
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm'
    const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks: BlobPart[] = []
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const done = new Promise<Blob>(res => { rec.onstop = () => res(new Blob(chunks, { type: mime })) })

    const draw = () => {
      const { dx, dy, dw, dh } = coverRect(video.videoWidth || 720, video.videoHeight || 1280)
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, OUT_W, OUT_H)
      ctx.drawImage(video, dx, dy, dw, dh)
      // bottom scrim for legibility over any footage
      const grad = ctx.createLinearGradient(0, OUT_H - 340, 0, OUT_H)
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.6)')
      ctx.fillStyle = grad; ctx.fillRect(0, OUT_H - 340, OUT_W, 340)
      ctx.textBaseline = 'alphabetic'
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2
      // optional caption (the user's text), bold, above the handle — brand display font (Space Grotesk)
      if (caption.trim()) { ctx.fillStyle = '#fff'; ctx.font = '700 56px "Space Grotesk", system-ui, sans-serif'; ctx.fillText(caption.trim().slice(0, 42), 48, OUT_H - 108) }
      // clean handle watermark in the brand font — red "@" brand pop, no bulky logo
      ctx.font = '700 46px "Space Grotesk", system-ui, sans-serif'
      ctx.fillStyle = '#e8404a'; ctx.fillText('@', 48, OUT_H - 44)
      const atW = ctx.measureText('@').width
      ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillText('ThatTeslaLightshow', 48 + atW + 2, OUT_H - 44)
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
      if (!video.paused && !video.ended && video.currentTime < MAX_SEC) requestAnimationFrame(draw)
    }

    // Make sure the brand font (Space Grotesk) is loaded before we render, or canvas falls back to system-ui.
    try { await Promise.all([document.fonts.load('700 46px "Space Grotesk"'), document.fonts.load('700 56px "Space Grotesk"')]) } catch { /* fall back to system font */ }
    try {
      video.currentTime = 0; video.muted = false
      await video.play()
      rec.start(); requestAnimationFrame(draw)
      const stop = () => { try { rec.state !== 'inactive' && rec.stop() } catch { /* noop */ }; video.pause(); video.muted = true }
      video.onended = stop
      const timer = setTimeout(stop, MAX_SEC * 1000)
      const blob = await done; clearTimeout(timer)
      setDownloadName(`tesla-lightshow-clip.${mime.includes('mp4') ? 'mp4' : 'webm'}`)
      setDownloadUrl(URL.createObjectURL(blob)); setStage('done')
      setMsg(mime.includes('mp4') ? 'Your MP4 clip is ready — download and post it!' : 'Your clip is ready (WebM). Great for YouTube; for TikTok/Instagram you may need to convert to MP4.')
    } catch {
      setStage('ready'); setMsg('Rendering failed — your browser may not support in-page recording. Try Chrome.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {stage === 'idle' && (
        <label style={{ display: 'block', padding: '3rem 1.5rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', background: 'var(--bg2)' }}>
          <input type="file" accept="video/*" onChange={onPick} style={{ display: 'none' }} />
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Upload your Tesla light-show video</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            We&apos;ll turn it into a branded 9:16 clip for TikTok / Reels. It stays <strong>on your device</strong> — the video is never uploaded.
          </div>
        </label>
      )}

      {stage !== 'idle' && (
        <div style={{ padding: '1.25rem 1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{fileName}</div>
          <div style={{ fontSize: 14, color: stage === 'rejected' ? '#ff8a8a' : stage === 'done' ? 'var(--green)' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {(stage === 'checking' || stage === 'recording') && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1s infinite' }} />}
            {msg}
          </div>

          {stage === 'ready' && (
            <>
              <input value={caption} onChange={e => setCaption(e.target.value)} maxLength={42} placeholder="Add a caption (optional) — e.g. song + your model"
                style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14 }} />
              <button onClick={exportClip} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>Export 9:16 clip →</button>
            </>
          )}

          {stage === 'done' && downloadUrl && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href={downloadUrl} download={downloadName} className="btn btn-primary btn-sm">⬇ Download clip</a>
              <button onClick={() => { setStage('idle'); setMsg(''); setCaption(''); setFileName(''); setDownloadUrl(null) }} className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', color: 'var(--text)' }}>Make another</button>
            </div>
          )}

          {stage === 'rejected' && (
            <button onClick={() => { setStage('idle'); setMsg('') }} className="btn btn-sm" style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', color: 'var(--text)' }}>Try another video</button>
          )}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.6 }}>
        🔒 Private by design: your video is processed entirely in your browser and never leaves your device.
        We check on-device that it&apos;s real car footage before adding our branding.
      </p>
    </div>
  )
}
