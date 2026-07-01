import type { Metadata } from 'next'
import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'
import SiteMenu from '@/components/SiteMenu'
import ClipStudio from './ClipStudio'

export const metadata: Metadata = {
  title: 'Make a Shareable Clip',
  description: 'Turn a video of your Tesla light show into a branded 9:16 clip for TikTok, Reels, and Stories — all in your browser, nothing uploaded.',
}

export default function ClipPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BrandLogo />
          <SiteMenu align="left" />
        </div>
        <Link href="/builder" className="btn btn-primary btn-sm">+ New Show</Link>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 700, marginBottom: 10 }}>
          Make a shareable clip
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 540, lineHeight: 1.6, marginBottom: 28 }}>
          Filmed your Tesla running a show? Turn it into a branded 9:16 clip to post — the fastest way to
          show it off. Everything happens in your browser; your video never leaves your device.
        </p>
        <ClipStudio />
      </main>
    </div>
  )
}
