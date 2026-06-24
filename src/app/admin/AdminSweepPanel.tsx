'use client'
import { useState } from 'react'

type Sweep = {
  id: string; run_at: string; mode: string
  orphans_found: number; bytes_found: number
  files_removed: number; bytes_removed: number; grace_days: number
}
type Report = {
  mode: string; orphansFound: number; bytesFound: number
  filesRemoved: number; bytesRemoved: number; totalFilesScanned: number
  sample: { path: string; sizeMB: number }[]
}

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`

export default function AdminSweepPanel({ initial }: { initial: Sweep[] }) {
  const [history, setHistory] = useState<Sweep[]>(initial)
  const [busy, setBusy] = useState<'' | 'dry_run' | 'soft_delete'>('')
  const [report, setReport] = useState<Report | null>(null)
  const [err, setErr] = useState('')

  async function run(mode: 'dry_run' | 'soft_delete') {
    if (mode === 'soft_delete' && !window.confirm('Move all unreferenced orphan files to trash/ (recoverable for 30 days)? Only files no show references and older than the grace window are affected.')) return
    setBusy(mode); setErr(''); setReport(null)
    try {
      const res = await fetch('/api/admin/storage-sweep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || 'Sweep failed') }
      else {
        setReport(data)
        // optimistic: prepend the run to the visible history
        setHistory(h => [{
          id: `local-${Date.now()}`, run_at: new Date().toISOString(), mode,
          orphans_found: data.orphansFound, bytes_found: data.bytesFound,
          files_removed: data.filesRemoved, bytes_removed: data.bytesRemoved, grace_days: 7,
        }, ...h])
      }
    } catch { setErr('Network error — please try again.') }
    setBusy('')
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => run('dry_run')} disabled={!!busy}
          style={{ padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', cursor: busy ? 'default' : 'pointer' }}>
          {busy === 'dry_run' ? 'Scanning…' : 'Run dry-run (report only)'}
        </button>
        <button onClick={() => run('soft_delete')} disabled={!!busy}
          style={{ padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'var(--red)', color: '#fff', border: '1px solid var(--red)', cursor: busy ? 'default' : 'pointer' }}>
          {busy === 'soft_delete' ? 'Cleaning…' : 'Run cleanup (→ trash, 30-day recoverable)'}
        </button>
      </div>

      {err && <div style={{ color: '#ff8a8a', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {report && (
        <div style={{ padding: '1rem 1.25rem', marginBottom: 16, borderRadius: 12, background: 'rgba(0,232,135,0.05)', border: '1px solid rgba(0,232,135,0.2)', fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {report.mode === 'dry_run' ? 'Dry-run' : 'Cleanup'} complete — scanned {report.totalFilesScanned} files.
          </div>
          <div style={{ color: 'var(--muted)' }}>
            Orphans found: <strong style={{ color: 'var(--text)' }}>{report.orphansFound}</strong> ({mb(report.bytesFound)})
            {report.mode !== 'dry_run' && <> · removed: <strong style={{ color: 'var(--text)' }}>{report.filesRemoved}</strong> ({mb(report.bytesRemoved)})</>}
          </div>
          {report.sample.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Sample of {report.sample.length} affected files</summary>
              <ul style={{ margin: '6px 0 0 1rem', color: 'var(--muted2)', fontSize: 12 }}>
                {report.sample.map((s, i) => <li key={i}>{s.path} · {s.sizeMB} MB</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Recent sweeps</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>{['When', 'Mode', 'Orphans', 'Found', 'Removed'].map(c => (
              <th key={c} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{c}</th>
            ))}</tr>
          </thead>
          <tbody>
            {history.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{new Date(s.run_at).toLocaleString()}</td>
                <td style={{ padding: '8px 12px', color: s.mode === 'dry_run' ? 'var(--muted)' : 'var(--red)' }}>{s.mode}</td>
                <td style={{ padding: '8px 12px' }}>{s.orphans_found}</td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{mb(s.bytes_found)}</td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{s.files_removed ? `${s.files_removed} (${mb(s.bytes_removed)})` : '—'}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted2)' }}>No sweeps yet — run a dry-run above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
