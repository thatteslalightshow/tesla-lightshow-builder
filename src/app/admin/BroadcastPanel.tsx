'use client'

import { useState } from 'react'

type Audience = 'all' | 'subscribers' | 'non_subscribers'
const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'All opted-in users',
  subscribers: 'Subscribers only',
  non_subscribers: 'Non-subscribers only',
}

// Compose a broadcast → send a PROOF to yourself → review in your inbox → Send to all.
// Featured/community-show content only goes out through this approved path.
export default function BroadcastPanel() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [busy, setBusy] = useState<'' | 'proof' | 'send'>('')
  const [msg, setMsg] = useState('')
  const [proofSent, setProofSent] = useState(false)

  async function go(mode: 'proof' | 'send') {
    if (!subject.trim() || !body.trim()) { setMsg('Add a subject and message first.'); return }
    if (mode === 'send' && !window.confirm(`Send this to ${AUDIENCE_LABEL[audience]}? This emails real customers and can’t be undone.`)) return
    setBusy(mode); setMsg('')
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, subject, body, audience }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) { setMsg(data.error || 'Failed to send.') }
      else if (mode === 'proof') { setProofSent(true); setMsg('✓ Proof sent to your email — review it, then Send to all.') }
      else { setMsg(`✓ Broadcast sent to ${data.recipients} recipient${data.recipients === 1 ? '' : 's'}.`); setProofSent(false) }
    } catch { setMsg('Request failed — try again.') }
    setBusy('')
  }

  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }

  return (
    <div style={{ padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input value={subject} onChange={e => { setSubject(e.target.value); setProofSent(false) }} placeholder="Subject — e.g. Build your Halloween light show 🎃" style={input} />
      <textarea value={body} onChange={e => { setBody(e.target.value); setProofSent(false) }} placeholder={'Your message…\n\nLinks (https://…) become clickable. An unsubscribe link is added automatically.'} rows={7} style={{ ...input, resize: 'vertical', lineHeight: 1.6 }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={audience} onChange={e => { setAudience(e.target.value as Audience); setProofSent(false) }} style={{ ...input, width: 'auto', cursor: 'pointer' }}>
          <option value="all">All opted-in users</option>
          <option value="subscribers">Subscribers only</option>
          <option value="non_subscribers">Non-subscribers only</option>
        </select>
        <button onClick={() => go('proof')} disabled={!!busy} className="btn btn-ghost btn-sm">
          {busy === 'proof' ? 'Sending…' : 'Send proof to me'}
        </button>
        <button onClick={() => go('send')} disabled={!!busy || !proofSent} className="btn btn-primary btn-sm" title={proofSent ? '' : 'Send a proof to yourself first'}>
          {busy === 'send' ? 'Sending…' : `Send to all →`}
        </button>
      </div>
      {!proofSent && <div style={{ fontSize: 12, color: 'var(--muted2)' }}>Send a proof to yourself first — “Send to all” unlocks once you’ve reviewed it.</div>}
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? 'var(--green)' : '#ff8a8a' }}>{msg}</div>}
    </div>
  )
}
