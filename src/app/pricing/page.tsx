import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Pricing — Tesla LightShow Builder',
  description: 'Build and preview Tesla light shows for free. Pay $2.99 only when you export. No subscription, no commitment.',
}

const FREE_FEATURES = [
  'Build unlimited shows',
  'Full beat detection and analysis',
  'Manual per-channel editing',
  'Left/right symmetry mode',
  'Live 3D preview on your Tesla model',
  'Share to the community gallery',
  '1 free USB export included',
]

const PAID_FEATURES = [
  'Everything in Free',
  'Unlimited USB exports at $2.99 each',
  'Audio-synced FSEQ + WAV package',
  'FSEQ v2 validation report',
  'Remix any public community show',
  'Priority support',
]

const FAQ = [
  {
    q: 'What does "free export" mean?',
    a: 'Your very first USB export — the ZIP file that goes on your Tesla — is completely free. After that, each additional export is $2.99. You can preview, edit, and update your shows as many times as you want at no cost.',
  },
  {
    q: 'What Tesla models are supported?',
    a: 'Model 3, Model Y, Model S, Model X, and Cybertruck. Each model has its own channel layout and 3D preview.',
  },
  {
    q: 'Do I need special hardware or software?',
    a: 'No. Just a USB drive (exFAT formatted) and a Tesla with the light show feature enabled. We handle all the FSEQ file generation — you just plug in and go.',
  },
  {
    q: 'What audio formats are supported?',
    a: 'MP3 and WAV for beat detection. For audio to play from your Tesla during the show, the file must be WAV — we flag this before you export.',
  },
  {
    q: 'Is there a subscription or monthly fee?',
    a: 'No. You only pay when you export. There\'s no subscription, no monthly fee, and no commitment. Build and preview for free forever.',
  },
  {
    q: 'What is an FSEQ file?',
    a: 'FSEQ (xLights sequence format v2) is the file format Tesla uses to drive light shows. It contains per-frame brightness values for each of your car\'s 48 light channels at 20 frames per second.',
  },
]

export default function PricingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: 60, background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
          <div style={{ width: 30, height: 30, background: 'var(--red)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>T</div>
          LightShow <span style={{ color: 'var(--red)', marginLeft: 4 }}>Builder</span>
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/gallery" className="btn btn-ghost btn-sm">Gallery</Link>
          <Link href="/auth" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-sm">Start free →</Link>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '5rem 2rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 16 }}>Pricing</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, marginBottom: 16, lineHeight: 1.1 }}>
            Build free.<br />Pay only when you export.
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '1rem', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
            No subscription. No monthly fee. Create, preview, and perfect your Tesla light show — then pay $2.99 to export when you&apos;re ready.
          </p>
        </div>

        {/* Pricing cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: '5rem' }}>

          {/* Free */}
          <div style={{ padding: '2.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 20 }}>Free forever</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>$0</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '2rem' }}>Includes your first export</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '2rem' }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
                  <span style={{ color: 'var(--green)', marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'var(--muted)' }}>{f}</span>
                </div>
              ))}
            </div>
            <Link href="/auth?mode=signup" className="btn btn-ghost btn-full" style={{ display: 'flex', justifyContent: 'center' }}>
              Get started free
            </Link>
          </div>

          {/* Per export */}
          <div style={{ padding: '2.5rem', background: 'var(--bg2)', border: '2px solid var(--red)', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #e8404a, #ff6b35)' }} />
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 20 }}>Per export</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>$2.99</span>
              <span style={{ fontSize: 14, color: 'var(--muted)', paddingBottom: 6 }}>/ export</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '2rem' }}>After your first free export</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '2rem' }}>
              {PAID_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
                  <span style={{ color: 'var(--green)', marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'var(--muted)' }}>{f}</span>
                </div>
              ))}
            </div>
            <Link href="/auth?mode=signup" className="btn btn-primary btn-full" style={{ display: 'flex', justifyContent: 'center' }}>
              Start building →
            </Link>
          </div>
        </div>

        {/* Value prop callout */}
        <div style={{ padding: '2.5rem', background: 'rgba(232,64,74,0.06)', border: '1px solid rgba(232,64,74,0.2)', borderRadius: 'var(--radius-lg)', marginBottom: '5rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, marginBottom: 12 }}>
            Less than a coffee. A light show that turns heads.
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
            A custom Tesla light show synced to your music plays at holiday gatherings, car meetups, and wherever you park. At $2.99, it costs less than a latte and lasts forever on your USB drive.
          </p>
        </div>

        {/* FAQ */}
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem', textAlign: 'center' }}>
            Frequently asked questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ padding: '1.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{item.q}</div>
                <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>{item.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, marginBottom: 16 }}>
            Ready to build your first show?
          </h2>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-lg" style={{ display: 'inline-flex' }}>
            Get started — it&apos;s free →
          </Link>
          <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 12 }}>No credit card required</div>
        </div>
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>← LightShow Builder</Link>
        <p style={{ fontSize: 12, color: 'var(--muted2)', margin: 0 }}>Not affiliated with Tesla, Inc.</p>
      </footer>
    </div>
  )
}
