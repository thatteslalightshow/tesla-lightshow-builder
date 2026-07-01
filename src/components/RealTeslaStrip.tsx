'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Homepage social proof: a strip of ADMIN-APPROVED real-car videos the community linked.
// Renders NOTHING until at least 3 approved videos exist, so the homepage never shows a weak/empty
// section — it lights up on its own as videos get approved in the admin queue.
interface Vid { token: string; name: string; model: string; thumb: string; likes: number }

const MODEL_LABEL: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S', modelX: 'Model X', cybertruck: 'Cybertruck',
};

export default function RealTeslaStrip() {
  const [vids, setVids] = useState<Vid[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/community/videos')
      .then((r) => r.json())
      .then((d) => { if (alive) setVids(Array.isArray(d.videos) ? d.videos : []); })
      .catch(() => { if (alive) setVids([]); });
    return () => { alive = false; };
  }, []);

  if (!vids || vids.length < 3) return null;

  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8 }}>Real Teslas, real shows</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem,3.5vw,2rem)', fontWeight: 700, letterSpacing: '-0.5px' }}>Not a render — actual cars running community shows</h2>
      </div>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
        {vids.map((v) => (
          <Link
            key={v.token}
            href={`/show/${v.token}`}
            style={{ flex: '0 0 auto', width: 168, scrollSnapAlign: 'start', textDecoration: 'none' }}
          >
            <div style={{ position: 'relative', width: 168, height: 298, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#08080f' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumb} alt={`${MODEL_LABEL[v.model] ?? 'Tesla'} light show`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent 55%)' }} />
              <div style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#fff', background: 'rgba(232,64,74,0.9)', padding: '3px 8px', borderRadius: 20 }}>{MODEL_LABEL[v.model] ?? 'Tesla'}</div>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
