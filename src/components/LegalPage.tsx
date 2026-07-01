import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'
import SiteMenu from '@/components/SiteMenu'

// Shared chrome for the Privacy / Terms / FAQ content pages.
export default function LegalPage({ title, updated, intro, children }: {
  title: string
  updated?: string
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link href="/" style={{ display: 'flex' }}><BrandLogo boxSize={30} /></Link>
          <SiteMenu align="left" />
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <Link href="/faq" style={{ color: 'var(--muted)' }}>FAQ</Link>
          <Link href="/contact" style={{ color: 'var(--muted)' }}>Contact</Link>
          <Link href="/privacy" style={{ color: 'var(--muted)' }}>Privacy</Link>
          <Link href="/terms" style={{ color: 'var(--muted)' }}>Terms</Link>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 6 }}>{title}</h1>
        {updated && <div style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: '2rem' }}>Last updated {updated}</div>}
        {intro && <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, marginBottom: '2.5rem' }}>{intro}</div>}
        <div className="legal-prose">{children}</div>
      </main>

      <style>{`
        .legal-prose h2 { font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; color: var(--text); margin: 2.25rem 0 0.6rem; }
        .legal-prose h3 { font-weight: 700; font-size: 0.98rem; color: var(--text); margin: 1.25rem 0 0.4rem; }
        .legal-prose p, .legal-prose li { font-size: 14.5px; line-height: 1.8; color: var(--muted); }
        .legal-prose p { margin: 0 0 0.9rem; }
        .legal-prose ul { margin: 0 0 1rem 1.15rem; }
        .legal-prose li { margin-bottom: 0.4rem; }
        .legal-prose strong { color: var(--text); font-weight: 600; }
        .legal-prose a { color: var(--red); }
      `}</style>
    </div>
  )
}
