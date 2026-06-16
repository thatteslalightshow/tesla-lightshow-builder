'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Show } from '@/lib/supabase';
import TeslaScene from '@/components/TeslaScene';

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}

const STYLE_LABELS: Record<string, string> = {
  energetic: 'Energetic', wave: 'Wave', strobe: 'Strobe', chase: 'Chase',
}

export default function ShowPreview({ show }: { show: Show }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--red)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', fontFamily: 'var(--font-display)' }}>T</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>LightShow Builder</span>
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLink} className="btn btn-ghost btn-sm">
            {copied ? '✓ Copied!' : '🔗 Copy link'}
          </button>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-sm">Build your own →</Link>
        </div>
      </nav>

      {/* Hero info */}
      <div style={{ padding: '2rem 2rem 1rem', maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '0.5rem' }}>
              {show.name}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-red">{STYLE_LABELS[show.style] ?? show.style}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                {MODEL_LABELS[show.tesla_model] ?? show.tesla_model}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { label: 'BPM', value: show.bpm ?? '—' },
              { label: 'Intensity', value: `${show.intensity}%` },
              ...(show.duration_sec ? [{ label: 'Duration', value: `${Math.floor(show.duration_sec / 60)}:${String(Math.round(show.duration_sec % 60)).padStart(2, '0')}` }] : []),
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3D Preview */}
      <div style={{ flex: 1, maxWidth: 960, width: '100%', margin: '0 auto', padding: '0 2rem 2rem' }}>
        <div style={{ height: 460, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <TeslaScene teslaModel={show.tesla_model} style={show.style} intensity={show.intensity} bpm={show.bpm ?? 120} />
        </div>

        {/* CTA */}
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '0.25rem' }}>Want to build your own?</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Upload any song, pick your Tesla model, and export in seconds.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink} className="btn btn-ghost btn-sm">{copied ? '✓ Copied!' : '🔗 Share'}</button>
            <Link href="/auth?mode=signup" className="btn btn-primary">Build your own →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
