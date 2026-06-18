'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import LightStrip from '@/components/LightStrip';

export interface GalleryShow {
  id: string;
  name: string;
  tesla_model: string;
  style: string;
  intensity: number;
  bpm: number | null;
  share_token: string;
  view_count: number;
  like_count: number;
  created_at: string;
  title: string;          // song title (or filename / show name fallback)
  artist: string | null;  // song artist
  creator: string;        // display name, or "ThatTeslaLightshow" for official
  official: boolean;
}

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S', modelX: 'Model X', cybertruck: 'Cybertruck',
};
const STYLE_LABELS: Record<string, string> = {
  energetic: 'Energetic', wave: 'Wave', strobe: 'Strobe', chase: 'Chase',
};
const STYLE_COLOR: Record<string, string> = {
  energetic: 'rgba(232,64,74,0.15)', wave: 'rgba(74,144,232,0.15)',
  strobe: 'rgba(232,216,74,0.14)', chase: 'rgba(0,232,135,0.12)',
};
const STYLE_TEXT: Record<string, string> = {
  energetic: '#ff8a8a', wave: '#80b0ff', strobe: '#ffe57a', chase: '#00e887',
};

const MODELS = ['model3', 'modelY', 'modelS', 'modelX', 'cybertruck'];
const STYLES = ['energetic', 'wave', 'strobe', 'chase'];
type Sort = 'popular' | 'newest' | 'liked';

export default function GalleryClient({ shows }: { shows: GalleryShow[] }) {
  const [model, setModel] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('popular');

  const filtered = useMemo(() => {
    let rows = shows.filter(s =>
      (!model || s.tesla_model === model) && (!style || s.style === style)
    );
    rows = [...rows].sort((a, b) => {
      if (sort === 'newest') return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === 'liked') return b.like_count - a.like_count || b.view_count - a.view_count;
      // popular = blended views + likes (likes weighted heavier)
      const score = (s: GalleryShow) => s.view_count + s.like_count * 5;
      return score(b) - score(a);
    });
    return rows;
  }, [shows, model, style, sort]);

  return (
    <>
      {/* Filter / sort bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterChip label="All models" active={model === null} onClick={() => setModel(null)} />
          {MODELS.map(m => (
            <FilterChip key={m} label={MODEL_LABELS[m]} active={model === m} onClick={() => setModel(model === m ? null : m)} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <FilterChip label="All styles" active={style === null} onClick={() => setStyle(null)} />
            {STYLES.map(s => (
              <FilterChip key={s} label={STYLE_LABELS[s]} active={style === s} onClick={() => setStyle(style === s ? null : s)}
                color={style === s ? STYLE_TEXT[s] : undefined} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 3 }}>
            {(['popular', 'newest', 'liked'] as Sort[]).map(s => (
              <button key={s} onClick={() => setSort(s)}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: sort === s ? 'var(--bg4)' : 'transparent',
                  color: sort === s ? 'var(--text)' : 'var(--muted)', textTransform: 'capitalize',
                }}>
                {s === 'liked' ? 'Most liked' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 16 }}>
        {filtered.length} show{filtered.length !== 1 ? 's' : ''}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No shows match these filters.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {filtered.map(show => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: active ? (color ? `${color}22` : 'rgba(232,64,74,0.14)') : 'var(--bg2)',
      border: `1px solid ${active ? (color ?? 'var(--red)') : 'var(--border)'}`,
      color: active ? (color ?? 'var(--red)') : 'var(--muted)', transition: 'all .12s',
    }}>
      {label}
    </button>
  );
}

function ShowCard({ show }: { show: GalleryShow }) {
  return (
    <Link href={`/show/${show.share_token}`} style={{ textDecoration: 'none' }}>
      <div className="gallery-card" style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: 14, display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color .15s, transform .15s',
        cursor: 'pointer', height: '100%',
      }}>
        {/* Animated preview */}
        <LightStrip style={show.style} bpm={show.bpm} intensity={show.intensity} height={72} />

        {/* Title row: song title + artist · model */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {show.title}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {show.artist ? `${show.artist} · ` : ''}{MODEL_LABELS[show.tesla_model] ?? show.tesla_model}
            </p>
          </div>
          <span style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: STYLE_COLOR[show.style] ?? 'var(--bg3)', color: STYLE_TEXT[show.style] ?? 'var(--muted)' }}>
            {STYLE_LABELS[show.style] ?? show.style}
          </span>
        </div>

        {/* Creator credit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: -2 }}>
          <span style={{ fontSize: 12, color: show.official ? 'var(--red)' : 'var(--muted2)', fontWeight: show.official ? 600 : 400 }}>
            by {show.creator}
          </span>
          {show.official && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.05em', color: 'var(--red)', background: 'rgba(232,64,74,0.12)', border: '1px solid rgba(232,64,74,0.3)', padding: '1px 6px', borderRadius: 10 }}>
              OFFICIAL
            </span>
          )}
        </div>

        {/* Stats footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          {show.bpm ? <span>🎵 {show.bpm}</span> : null}
          <span>👁 {formatCount(show.view_count)}</span>
          <span>❤️ {formatCount(show.like_count)}</span>
        </div>
      </div>
    </Link>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
