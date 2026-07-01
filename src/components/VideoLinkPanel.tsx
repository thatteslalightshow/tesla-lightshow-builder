'use client'

import { useState } from 'react'
import { parseSocialLink } from '@/lib/social-link'
import { moderateImage } from '@/lib/clip-moderation'

// Reusable "link your real-car video" control — paste a TikTok/YouTube post → on-device thumbnail check
// (car + appropriate) → save. Clean auto-approves (live); flagged is held for admin review. Used on the
// show page and, in `compact` form, on the My Shows dashboard. Caller must ensure the user OWNS the show.
export default function VideoLinkPanel({
  showId, initialUrl = null, initialStatus = null, compact = false,
}: { showId: string; initialUrl?: string | null; initialStatus?: string | null; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [status, setStatus] = useState<string | null>(initialStatus)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(!compact)

  async function submit() {
    if (!parseSocialLink(input)) { setMsg('Paste a public TikTok or YouTube link.'); return }
    setBusy(true); setMsg('Reading the post…')
    try {
      const r = await fetch('/api/oembed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: input }) })
      const d = await r.json()
      if (!d.ok) { setMsg(d.error || 'Could not read that post.'); setBusy(false); return }
      let st = 'pending', reason: string | null = 'No preview to verify — held for review.'
      if (d.thumbnail) { setMsg('Checking it on your device…'); const m = await moderateImage(d.thumbnail); st = m.ok ? 'approved' : 'pending'; reason = m.ok ? null : (m.reason || 'Flagged by the automatic check.') }
      const s = await fetch('/api/shows/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show_id: showId, url: d.url, status: st, reason, thumb_url: d.thumbUrl }) })
      const sd = await s.json()
      if (!s.ok) { setMsg(sd.error || 'Could not save the link.'); setBusy(false); return }
      setUrl(d.url); setStatus(sd.status); setInput('')
      setMsg(sd.status === 'approved' ? '✓ Linked — it now shows on this show.' : "In review — it'll appear once approved.")
    } catch { setMsg('Something went wrong. Try again.') }
    setBusy(false)
  }
  async function remove() {
    setBusy(true)
    try { await fetch('/api/shows/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show_id: showId, url: null }) }) } catch { /* noop */ }
    setUrl(null); setStatus(null); setInput(''); setMsg(''); setBusy(false); if (compact) setOpen(false)
  }

  const badge = status === 'approved'
    ? { t: '✓ Live', c: '#00e887', bg: 'rgba(0,232,135,0.12)' }
    : status === 'rejected'
      ? { t: '✕ Not approved', c: '#ff8a8a', bg: 'rgba(255,138,138,0.12)' }
      : { t: '⏳ In review', c: '#ffcf8a', bg: 'rgba(255,180,80,0.12)' }

  // Compact + no link yet → a small call-to-action button that expands the input.
  if (compact && !url && !open) {
    return <button onClick={() => setOpen(true)} className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: '#e8404a', borderColor: 'rgba(232,64,74,0.4)' }}>📹 Link your video</button>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {url ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 10, color: badge.c, background: badge.bg }}>{badge.t}</span>
          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--red)', wordBreak: 'break-all', flex: 1, minWidth: 140 }}>{url}</a>
          <button onClick={remove} disabled={busy} className="btn btn-sm" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}>Remove</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="https://tiktok.com/… or https://youtube.com/…"
            style={{ flex: 1, minWidth: 200, padding: '8px 11px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 13 }} />
          <button onClick={submit} disabled={busy || !input.trim()} className="btn btn-primary btn-sm">{busy ? 'Checking…' : 'Add link'}</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--green)' : msg.includes('review') ? '#ffcf8a' : (msg.includes('wrong') || msg.includes('Could not') || msg.includes('Paste')) ? '#ff8a8a' : 'var(--muted)' }}>{msg}</div>}
    </div>
  )
}
