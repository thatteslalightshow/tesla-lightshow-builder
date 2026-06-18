import Link from 'next/link';

/**
 * The single source of truth for the brand mark in navs.
 * Primary name "ThatTeslaLightshow" with "Light Show Builder" as a tagline.
 * The tagline auto-hides on narrow screens (see .brand-tagline in globals.css).
 */
export default function BrandLogo({
  href = '/',
  label = 'ThatTeslaLightshow',
  tagline = 'Light Show Builder',
  showTagline = true,
  boxSize = 32,
}: {
  href?: string;
  label?: string;
  tagline?: string | null;
  showTagline?: boolean;
  boxSize?: number;
}) {
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
      <div style={{
        width: boxSize, height: boxSize, background: 'var(--red)', borderRadius: Math.round(boxSize * 0.25),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: Math.round(boxSize * 0.44), color: '#fff',
        fontFamily: 'var(--font-display)', flexShrink: 0,
      }}>T</div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '-0.2px', color: 'var(--text)' }}>
          {label}
        </span>
        {showTagline && tagline && (
          <span className="brand-tagline" style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)', letterSpacing: '0.02em' }}>
            {tagline}
          </span>
        )}
      </div>
    </Link>
  );
}
