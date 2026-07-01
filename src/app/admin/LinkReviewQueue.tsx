'use client'

import { useState } from 'react'

export interface PendingLink {
  id: string
  name: string
  social_url: string
  social_thumb_url: string | null
  social_flag_reason: string | null
  social_submitted_at: string | null
}

// Admin review of FLAGGED community links held in the pending state. Shows which show it's on, the
// post's thumbnail, the pasted link, and WHY it was flagged — with Approve / Deny.
export default function LinkReviewQueue({ items }: { items: PendingLink[] }) {
  const [rows, setRows] = useState(items)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(id: string, action: 'approve' | 'deny') {
    setBusy(id)
    try {
      const r = await fetch('/api/admin/review-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show_id: id, action }) })
      if (r.ok) setRows(rs => rs.filter(x => x.id !== id))
    } finally { setBusy(null) }
  }

  return (
    <div style={{ padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Community links — review queue</h2>
        {rows.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#e8404a', padding: '2px 8px', borderRadius: 10 }}>{rows.length}</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Flagged links are held (not shown on the site) until you approve them.</p>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted2)' }}>Nothing to review — all clear. ✓</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(row => (
            <div key={row.id} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {row.social_thumb_url
                ? <img src={row.social_thumb_url} alt="" style={{ width: 64, height: 96, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: '#000' }} />
                : <div style={{ width: 64, height: 96, borderRadius: 6, background: '#000', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 22 }}>🎬</div>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name || 'Untitled show'}</div>
                <a href={row.social_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#e8404a', wordBreak: 'break-all' }}>{row.social_url}</a>
                <div style={{ fontSize: 12, color: '#ffb3b3', marginTop: 4 }}>⚑ {row.social_flag_reason || 'Flagged'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => act(row.id, 'approve')} disabled={busy === row.id} className="btn btn-sm" style={{ background: 'rgba(0,232,135,0.15)', border: '1px solid rgba(0,232,135,0.4)', color: '#00e887' }}>Approve</button>
                <button onClick={() => act(row.id, 'deny')} disabled={busy === row.id} className="btn btn-sm" style={{ background: 'rgba(255,138,138,0.12)', border: '1px solid rgba(255,138,138,0.35)', color: '#ff8a8a' }}>Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
