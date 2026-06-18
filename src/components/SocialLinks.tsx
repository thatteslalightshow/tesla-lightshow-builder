'use client';
import type { CSSProperties } from 'react';

const HANDLE = 'ThatTeslaLightshow';

const SOCIALS = [
  {
    name: 'TikTok',
    href: `https://tiktok.com/@${HANDLE}`,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.01a8.16 8.16 0 004.77 1.52V7.1a4.85 4.85 0 01-1-.41z"/>
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: `https://instagram.com/${HANDLE}`,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
        <circle cx="12" cy="12" r="4"/>
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    name: 'X',
    href: `https://x.com/${HANDLE}`,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: `https://facebook.com/${HANDLE}`,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
      </svg>
    ),
  },
];

interface Props {
  style?: CSSProperties;
  iconColor?: string;
  gap?: number;
  size?: number;
}

export default function SocialLinks({ style, iconColor = 'rgba(255,255,255,0.35)', gap = 4, size = 32 }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, ...style }}>
      {SOCIALS.map(s => (
        <a
          key={s.name}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Follow on ${s.name}`}
          style={{
            width: size, height: size, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: iconColor, border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)', transition: 'color .15s, background .15s, border-color .15s',
            textDecoration: 'none',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLAnchorElement;
            el.style.color = '#fff';
            el.style.background = 'rgba(255,255,255,0.1)';
            el.style.borderColor = 'rgba(255,255,255,0.2)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLAnchorElement;
            el.style.color = iconColor;
            el.style.background = 'rgba(255,255,255,0.04)';
            el.style.borderColor = 'rgba(255,255,255,0.08)';
          }}
        >
          {s.icon}
        </a>
      ))}
    </div>
  );
}
