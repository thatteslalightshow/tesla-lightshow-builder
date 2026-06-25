'use client';
import type { CSSProperties } from 'react';

// Each platform has its OWN exact profile URL (handles differ per network — e.g.
// Instagram uses dots, X caps at 15 chars). Update any of these to the real URL.
//   ✅ Instagram confirmed: that.teslalightshow
//   ⚠️  TikTok / X / Facebook / Reddit below are best-guesses — swap in the real ones.
const SOCIALS = [
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@thatteslalightshow',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.01a8.16 8.16 0 004.77 1.52V7.1a4.85 4.85 0 01-1-.41z"/>
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/that.teslalightshow',
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
    href: 'https://x.com/thatteslalightshow',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/thatteslalightshow',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
      </svg>
    ),
  },
  {
    name: 'Reddit',
    href: 'https://www.reddit.com/r/TeslaLightShow',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5.01 9.06c.02.16.03.32.03.49 0 2.5-2.91 4.53-6.5 4.53s-6.5-2.03-6.5-4.53c0-.17.01-.33.03-.49a1.36 1.36 0 01.95-2.32c.34 0 .65.13.88.34a6.6 6.6 0 013.46-1.09l.66-3.09 2.16.46a1.06 1.06 0 102.02.66c0 .56-.43 1.02-.99 1.06l-1.78-.38-.59 2.79a6.6 6.6 0 013.36 1.08 1.27 1.27 0 11.42 2.27zM8.93 11.5a1.06 1.06 0 102.12 0 1.06 1.06 0 00-2.12 0zm5.2 2.6c-.5.5-1.36.74-2.13.74s-1.63-.24-2.13-.74a.28.28 0 00-.4.4c.63.63 1.66.86 2.53.86s1.9-.23 2.53-.86a.28.28 0 10-.4-.4zm-.32-1.54a1.06 1.06 0 102.12 0 1.06 1.06 0 00-2.12 0z"/>
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
