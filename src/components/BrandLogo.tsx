import Link from 'next/link';

/**
 * The compact wordmark used in navs — matches the "THAT LIGHTSHOW" logo lockup
 * (THAT dim-white · LIGHT red · SHOW white) with a "TESLA LIGHTSHOW BUILDER"
 * tagline. A clean text lockup, NOT the detailed full logo (which only reads at
 * large sizes — that one lives on the landing hero / auth / share image instead).
 * Props kept stable so existing callers (boxSize / showTagline / tagline) work.
 */
export default function BrandLogo({
  href = '/',
  showTagline = true,
  boxSize = 32,
}: {
  href?: string;
  label?: string;
  tagline?: string | null;
  showTagline?: boolean;
  boxSize?: number;
}) {
  const size = Math.round(boxSize * 0.54); // wordmark cap height derived from the old box size
  return (
    <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.04 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size,
          letterSpacing: '0.6px', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.9)' }}>THAT</span>
          <span style={{ color: 'var(--red, #e8404a)' }}>LIGHT</span>
          <span style={{ color: '#fff' }}>SHOW</span>
        </span>
        {showTagline && (
          <span className="brand-tagline" style={{
            fontSize: Math.max(7.5, Math.round(size * 0.42)), fontWeight: 600,
            color: 'var(--muted)', letterSpacing: '2.2px', marginTop: 3,
          }}>
            TESLA LIGHTSHOW BUILDER
          </span>
        )}
      </div>
    </Link>
  );
}
