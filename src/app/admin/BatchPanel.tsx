'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseId3, titleFromFilename } from '@/lib/id3'

const MODELS = [
  { value: 'model3', label: 'Model 3' }, { value: 'modelY', label: 'Model Y' },
  { value: 'modelS', label: 'Model S' }, { value: 'modelX', label: 'Model X' },
  { value: 'cybertruck', label: 'Cybertruck' },
]
const MAX = 8
type Status = 'pending' | 'uploading' | 'done' | 'failed'

// Admin/tester batch tool: drop several songs → one ZIP of FSEQ+WAV pairs (each pair
// named "Title-Artist" so it pairs on a USB). Full shows (closures on). Not customer-facing.
export default function BatchPanel() {
  const [files, setFiles] = useState<File[]>([])
  const [model, setModel] = useState('model3')
  const [busy, setBusy] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [msg, setMsg] = useState('')

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files ?? []).slice(0, MAX)
    setFiles(fs); setStatuses({}); setMsg(fs.length >= MAX ? `Max ${MAX} per batch.` : '')
  }

  async function run() {
    if (!files.length || busy) return
    setBusy(true); setMsg('Uploading…')
    const items: { path: string; baseName: string }[] = []
    const st: Record<string, Status> = {}
    files.forEach(f => { st[f.name] = 'pending' })
    setStatuses({ ...st })

    for (const f of files) {
      st[f.name] = 'uploading'; setStatuses({ ...st })
      try {
        const tags = await parseId3(f)
        const title = tags.title?.trim() || titleFromFilename(f.name)
        const baseName = tags.artist?.trim() ? `${title}-${tags.artist.trim()}` : title
        const signRes = await fetch('/api/admin/batch-upload-sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: f.name, file_size: f.size }) })
        const sign = await signRes.json().catch(() => ({}))
        if (!signRes.ok || !sign.path) throw new Error(sign.error || 'sign failed')
        const { error } = await supabase.storage.from('audio-files').uploadToSignedUrl(sign.path, sign.token, f, { contentType: f.type || 'audio/mpeg' })
        if (error) throw error
        items.push({ path: sign.path, baseName })
        st[f.name] = 'done'; setStatuses({ ...st })
      } catch { st[f.name] = 'failed'; setStatuses({ ...st }) }
    }

    if (!items.length) { setMsg('All uploads failed.'); setBusy(false); return }
    setMsg(`Generating ${items.length} show${items.length === 1 ? '' : 's'} — this can take a minute…`)
    try {
      const res = await fetch('/api/admin/batch-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, items }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) { setMsg(data.error || 'Batch export failed.'); setBusy(false); return }
      const a = document.createElement('a'); a.href = data.url; a.download = `batch_${model}.zip`; a.click()
      setMsg(`✓ ${data.count} show${data.count === 1 ? '' : 's'} exported${data.failures?.length ? ` · ${data.failures.length} failed` : ''}. ZIP downloaded.`)
    } catch { setMsg('Batch export request failed.') }
    setBusy(false)
  }

  const dot = (s: Status) => s === 'done' ? 'var(--green)' : s === 'failed' ? '#ff8a8a' : s === 'uploading' ? '#ff8c00' : 'var(--muted2)'
  const input: React.CSSProperties = { padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }

  return (
    <div style={{ padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ ...input }}>
          <input type="file" accept="audio/*,.mp3,.wav,.m4a" multiple onChange={onPick} style={{ display: 'none' }} disabled={busy} />
          {files.length ? `${files.length} song${files.length === 1 ? '' : 's'} selected` : 'Choose songs…'}
        </label>
        <select value={model} onChange={e => setModel(e.target.value)} disabled={busy} style={{ ...input }}>
          {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
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
            </div>
          ))}
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? 'var(--green)' : msg.includes('fail') || msg.includes('Max') ? '#ff8a8a' : 'var(--muted)' }}>{msg}</div>}
    </div>
  )
}
