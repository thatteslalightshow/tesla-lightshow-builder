'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Surfaces the site's resource links (previously buried in the footer) from the top
// nav of every main page. One lightweight dropdown reused across home/pricing/gallery.
const PRIMARY = [
  { href: '/gallery', label: 'Community Gallery' },
  { href: '/guide', label: 'Setup Guide' },
  { href: '/faq', label: 'FAQ' },
  { href: '/pricing', label: 'Pricing' },
];
const SECONDARY = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export default function SiteMenu({ align = 'right' }: { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const item = (l: { href: string; label: string }, dim: boolean) => (
    <Link key={l.href} href={l.href} onClick={() => setOpen(false)} role="menuitem"
      style={{ display: 'block', padding: dim ? '7px 12px' : '9px 12px', fontSize: dim ? 12.5 : 13.5, color: dim ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)', borderRadius: 8, transition: 'background .12s, color .12s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = dim ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)'; }}>
      {l.label}
    </Link>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 13, color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, transition: 'color .15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}>
        Menu <span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', [align]: 0, minWidth: 184, padding: 6, background: 'rgba(15,15,20,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 100 } as React.CSSProperties}>
          {PRIMARY.map(l => item(l, false))}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '5px 8px' }} />
          {SECONDARY.map(l => item(l, true))}
        </div>
      )}
    </div>
  );
}
