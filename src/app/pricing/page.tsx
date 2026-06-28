import type { Metadata } from 'next'
import Link from 'next/link'
import SocialLinks from '@/components/SocialLinks'
import BrandLogo from '@/components/BrandLogo'
import SiteMenu from '@/components/SiteMenu'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Build and preview Tesla light shows free. Pay $2.99 per export, or go unlimited with Creator at $6.99/mo.',
}

const FREE_FEATURES = [
  'Build unlimited shows',
  'Full music-reactive audio engine',
  'Live 3D preview on your exact model',
  'Manual per-channel editing',
  'Cloud library — 1 saved show',
  'Share to the community gallery',
  '1 free USB export included',
]

const PER_EXPORT_FEATURES = [
  'Everything in Free',
  'Export any show for $2.99',
  'Beat-synced FSEQ light sequence',
  'Emailed backup + BYOM setup steps',
  'FSEQ v2 validation report',
  'Pay only when you export — no commitment',
]

// Creator's `unlock: true` perks render with a ★ + brighter text to make the upgrade
// value pop — what you get that the pay-as-you-go tier doesn't.
const CREATOR_FEATURES: { text: string; unlock?: boolean }[] = [
  { text: 'Everything in Per export' },
  { text: 'Unlimited exports — no per-show fee' },
  { text: 'Free re-exports of any show, forever', unlock: true },
  { text: 'Multi-model export — build once, export for every Tesla you own', unlock: true },
  { text: 'Unlimited cloud library — every show saved & backed up', unlock: true },
  { text: 'Remix any public community show' },
  { text: 'Priority support' },
  { text: 'Cancel anytime' },
]

const FAQ = [
  {
    q: 'What does "free export" mean?',
    a: 'Your very first USB export — the ZIP file that goes on your Tesla — is completely free. After that, you can either pay $2.99 per export or subscribe to Creator for unlimited exports.',
  },
  {
    q: 'Should I pay per export or subscribe?',
    a: 'If you only need a show or two, pay $2.99 per export — no commitment. If you create regularly (new shows for holidays, meetups, seasons), Creator at $6.99/mo pays for itself after about three shows a month, and the annual plan ($59.99/yr — save 28%) is the best value.',
  },
  {
    q: 'What extra do I get with Creator?',
    a: 'Beyond unlimited exports: free re-exports of any show forever, multi-model export (build a show once and export a tailored version for every Tesla you own in a single download), an unlimited cloud library so every show stays saved and backed up, the ability to remix any public community show, and priority support.',
  },
  {
    q: 'Do I get my show by email?',
    a: 'Yes — on every plan. Each export downloads instantly in your browser and we also email you a backup download link plus step-by-step BYOM setup instructions, so you always have it and know exactly what to do next.',
  },
  {
    q: 'Can I cancel the Creator subscription anytime?',
    a: 'Yes. Manage or cancel anytime from your dashboard — you keep access through the end of your billing period. Any shows you already exported are yours to keep forever.',
  },
  {
    q: 'What Tesla models are supported?',
    a: 'Model 3, Model Y, Model S, Model X, and Cybertruck — including the refreshed Model Y (Juniper), whose front light bar dances right along with the music. Each model has its own 3D preview.',
  },
  {
    q: 'Do I need special hardware or software?',
    a: 'No. Just a USB drive (exFAT formatted) and a Tesla with the light show feature enabled. We handle all the FSEQ file generation — you just plug in and go.',
  },
  {
    q: 'What is an FSEQ file?',
    a: 'FSEQ (xLights sequence format v2) is the file format Tesla uses to drive light shows. It contains per-frame values for every light and closure channel on your car, at 50 frames per second. It\'s the choreography — not the music.',
  },
  {
    q: 'Is the song included in my export?',
    a: 'No — choreography by us, soundtrack by you. Your export is the light sequence, not the music. We use your upload only to build the show, then delete it the moment you export. To run a show you add your own copy of the same song; every export comes with simple step-by-step instructions (easiest path: reuse the exact file you uploaded). It keeps everyone on the right side of the music — the song belongs to the artists who made it.',
  },
]

function Feature({ text, unlock }: { text: string; unlock?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
      <span style={{ color: unlock ? 'var(--red)' : 'var(--green)', marginTop: 1, flexShrink: 0 }}>{unlock ? '★' : '✓'}</span>
      <span style={{ color: unlock ? 'var(--text)' : 'var(--muted)', fontWeight: unlock ? 600 : 400 }}>{text}</span>
    </div>
  )
}

export default function PricingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: 60, background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <BrandLogo boxSize={30} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SiteMenu />
          <Link href="/auth" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-sm">Start free →</Link>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '5rem 2rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 16 }}>Pricing</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, marginBottom: 16, lineHeight: 1.1 }}>
            Build free.<br />Export your way.
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '1rem', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
            Create, preview, and perfect your Tesla light show for free. When you&apos;re ready to export, pay once at $2.99 — or go unlimited with Creator.
          </p>
        </div>

        {/* Pricing cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: '4rem', alignItems: 'start' }}>

          {/* Free */}
          <div style={{ padding: '2rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 18 }}>Free</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', fontWeight: 700, lineHeight: 1 }}>$0</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.75rem' }}>Includes your first export</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.75rem' }}>
              {FREE_FEATURES.map(f => <Feature key={f} text={f} />)}
            </div>
            <Link href="/auth?mode=signup" className="btn btn-ghost btn-full" style={{ display: 'flex', justifyContent: 'center' }}>
              Get started free
            </Link>
          </div>

          {/* Per export */}
          <div style={{ padding: '2rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 18 }}>Per export</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', fontWeight: 700, lineHeight: 1 }}>$2.99</span>
              <span style={{ fontSize: 14, color: 'var(--muted)', paddingBottom: 6 }}>/ export</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.75rem' }}>Pay as you go, no commitment</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.75rem' }}>
              {PER_EXPORT_FEATURES.map(f => <Feature key={f} text={f} />)}
            </div>
            <Link href="/auth?mode=signup" className="btn btn-ghost btn-full" style={{ display: 'flex', justifyContent: 'center' }}>
              Start building →
            </Link>
          </div>

          {/* Creator subscription */}
          <div style={{ padding: '2rem', background: 'var(--bg2)', border: '2px solid var(--red)', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #e8404a, #ff6b35)' }} />
            <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: '#fff', background: 'var(--red)', padding: '3px 8px', borderRadius: 10 }}>BEST VALUE</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 18 }}>Creator</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', fontWeight: 700, lineHeight: 1 }}>$6.99</span>
              <span style={{ fontSize: 14, color: 'var(--muted)', paddingBottom: 6 }}>/ month</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.75rem' }}>or $59.99/year — save 28%</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.75rem' }}>
              {CREATOR_FEATURES.map(f => <Feature key={f.text} text={f.text} unlock={f.unlock} />)}
            </div>
            <Link href="/auth?mode=signup" className="btn btn-primary btn-full" style={{ display: 'flex', justifyContent: 'center' }}>
              Go unlimited →
            </Link>
          </div>
        </div>

        {/* Value prop callout */}
        <div style={{ padding: '2.5rem', background: 'rgba(232,64,74,0.06)', border: '1px solid rgba(232,64,74,0.2)', borderRadius: 'var(--radius-lg)', marginBottom: '5rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, marginBottom: 12 }}>
            Start free. Upgrade only if you love it.
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
            Every account gets a free export to try the whole flow end to end. Pay $2.99 for the occasional show, or subscribe to Creator once you&apos;re building regularly — about three shows a month already beats per-export pricing.
          </p>
        </div>

        {/* FAQ */}
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem', textAlign: 'center' }}>
            Frequently asked questions
          </h2>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
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

      <footer style={{ borderTop: '1px solid var(--border)', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>← ThatTeslaLightshow</Link>
        <SocialLinks gap={4} size={28} />
        <p style={{ fontSize: 12, color: 'var(--muted2)', margin: 0 }}>Not affiliated with Tesla, Inc.</p>
      </footer>
    </div>
  )
}
