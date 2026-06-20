import type { Metadata } from 'next'
import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'
import SocialLinks from '@/components/SocialLinks'

export const metadata: Metadata = {
  title: 'Guide — How to build & load a Tesla light show',
  description: 'Step-by-step: build your show, format a USB drive (Windows & Mac), and run your custom light show on your Tesla.',
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(232,64,74,0.14)', border: '1px solid rgba(232,64,74,0.35)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
        <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.75 }}>{children}</div>
      </div>
    </div>
  )
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: '4rem', scrollMarginTop: 80 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8 }}>{eyebrow}</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem,3.5vw,2rem)', fontWeight: 700, marginBottom: '1.75rem', letterSpacing: '-0.5px' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>{children}</div>
    </section>
  )
}

export default function GuidePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <BrandLogo />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/gallery" className="btn btn-ghost btn-sm">Gallery</Link>
          <Link href="/builder" className="btn btn-primary btn-sm">+ New Show</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '3.5rem 1.5rem 5rem' }}>
        <div style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,5vw,2.8rem)', fontWeight: 700, letterSpacing: '-1.5px', marginBottom: 12 }}>
            How to use ThatTeslaLightshow
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, maxWidth: 560 }}>
            From your song to a show running on your Tesla in a few minutes. Build it here, put it on a USB drive, and play it in the car.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18, fontSize: 13 }}>
            <a href="#build" style={{ color: 'var(--red)' }}>1. Build</a>
            <a href="#usb" style={{ color: 'var(--red)' }}>2. Format USB</a>
            <a href="#copy" style={{ color: 'var(--red)' }}>3. Copy the show</a>
            <a href="#run" style={{ color: 'var(--red)' }}>4. Run it</a>
          </div>
        </div>

        {/* Build */}
        <Section id="build" eyebrow="In the app" title="1 · Build your show">
          <Step n="A" title="Upload your song">
            Click <strong style={{ color: 'var(--text)' }}>+ New Show</strong>, then upload any audio file (MP3, WAV, M4A, AAC, OGG…).
            We automatically convert it to the Tesla-ready format and detect the beat for you.
          </Step>
          <Step n="B" title="Pick your Tesla & a style">
            Choose your model (Model 3, Y, S, X, or Cybertruck) and a light-show style — Energetic, Wave, Pulse, Ripple, and more.
            Watch it animate live in 3D.
          </Step>
          <Step n="C" title="Customize (optional)">
            Switch to <strong style={{ color: 'var(--text)' }}>Edit</strong> mode to paint individual lights beat-by-beat in the timeline,
            or place closure commands (windows, doors, charge port). Then preview against your song.
          </Step>
          <Step n="D" title="Export">
            Click <strong style={{ color: 'var(--text)' }}>Export</strong>. You'll get a ZIP file (or a download link by email).
            Unzip it — inside is a folder named <code style={codeStyle}>LightShow</code> containing <code style={codeStyle}>lightshow.fseq</code> and <code style={codeStyle}>lightshow.wav</code>.
          </Step>
        </Section>

        {/* USB format */}
        <Section id="usb" eyebrow="On your computer" title="2 · Format a USB drive">
          <div style={calloutStyle}>
            Your USB drive must be <strong style={{ color: 'var(--text)' }}>exFAT</strong> or <strong style={{ color: 'var(--text)' }}>FAT32</strong> —
            <strong style={{ color: '#ff8a8a' }}> not NTFS</strong>. It also must <strong style={{ color: 'var(--text)' }}>not</strong> contain a <code style={codeStyle}>TeslaCam</code> folder.
            Formatting erases the drive, so back up anything on it first.
          </div>

          <div>
            <h3 style={subhead}>On Windows</h3>
            <ol style={olStyle}>
              <li>Plug in the USB drive and open <strong style={{ color: 'var(--text)' }}>File Explorer</strong>.</li>
              <li>Right-click the drive → <strong style={{ color: 'var(--text)' }}>Format…</strong></li>
              <li>Set <strong style={{ color: 'var(--text)' }}>File system</strong> to <strong style={{ color: 'var(--text)' }}>exFAT</strong> (or FAT32 for drives 32&nbsp;GB or smaller).</li>
              <li>Leave <strong style={{ color: 'var(--text)' }}>Quick Format</strong> checked, click <strong style={{ color: 'var(--text)' }}>Start</strong>, then OK.</li>
            </ol>
          </div>

          <div>
            <h3 style={subhead}>On macOS</h3>
            <ol style={olStyle}>
              <li>Plug in the USB drive and open <strong style={{ color: 'var(--text)' }}>Disk Utility</strong> (Applications → Utilities, or search with Spotlight).</li>
              <li>In the sidebar, click <strong style={{ color: 'var(--text)' }}>View → Show All Devices</strong>, then select the <strong style={{ color: 'var(--text)' }}>top-level drive</strong> (the device, not the volume under it).</li>
              <li>Click <strong style={{ color: 'var(--text)' }}>Erase</strong>.</li>
              <li>Format: <strong style={{ color: 'var(--text)' }}>ExFAT</strong> (or <strong style={{ color: 'var(--text)' }}>MS-DOS (FAT)</strong> for FAT32). Scheme: <strong style={{ color: 'var(--text)' }}>Master Boot Record</strong>.</li>
              <li>Click <strong style={{ color: 'var(--text)' }}>Erase</strong>, then Done.</li>
            </ol>
          </div>
        </Section>

        {/* Copy */}
        <Section id="copy" eyebrow="On your computer" title="3 · Copy the show onto the drive">
          <Step n="A" title="Unzip the export">
            Double-click the ZIP you downloaded. You'll get a <code style={codeStyle}>LightShow</code> folder.
          </Step>
          <Step n="B" title="Drag the LightShow folder to the USB root">
            Copy the entire <code style={codeStyle}>LightShow</code> folder to the <strong style={{ color: 'var(--text)' }}>top level</strong> of the USB drive
            (not inside another folder). The folder name must be exactly <code style={codeStyle}>LightShow</code> (capital L, capital S).
          </Step>
          <Step n="C" title="Check the contents">
            Inside should be <code style={codeStyle}>lightshow.fseq</code> and <code style={codeStyle}>lightshow.wav</code> — the names must match each other.
            You can keep multiple shows on one drive (e.g. <code style={codeStyle}>summer.fseq</code> + <code style={codeStyle}>summer.wav</code>).
          </Step>
        </Section>

        {/* Run */}
        <Section id="run" eyebrow="In your Tesla" title="4 · Run it on your Tesla">
          <Step n="A" title="Plug in the drive">
            Insert the USB into a <strong style={{ color: 'var(--text)' }}>front USB/USB-C port or the glovebox port</strong>, then wait a few seconds.
          </Step>
          <Step n="B" title="Open Light Show">
            On the screen, go to <strong style={{ color: 'var(--text)' }}>Toybox → Light Show</strong> and tap <strong style={{ color: 'var(--text)' }}>Schedule Show</strong>.
          </Step>
          <Step n="C" title="Select your show">
            Pick your show from the drop-down and enjoy. Put the car in Park with the doors closed for the full effect.
          </Step>
          <div style={calloutStyle}>
            <strong style={{ color: 'var(--text)' }}>Troubleshooting:</strong> if the popup says <em>"Light Show"</em> instead of <em>"Custom Light Show,"</em> the
            USB format or folder isn't right — re-check the format (exFAT/FAT32), the <code style={codeStyle}>LightShow</code> folder name, and that there's no <code style={codeStyle}>TeslaCam</code> folder.
          </div>
        </Section>

        <div style={{ textAlign: 'center', paddingTop: '1rem' }}>
          <Link href="/builder" className="btn btn-primary btn-lg" style={{ display: 'inline-flex' }}>Build your show →</Link>
        </div>
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--muted2)' }}>ThatTeslaLightshow · Not affiliated with Tesla, Inc.</span>
        <SocialLinks gap={4} size={26} />
      </footer>
    </div>
  )
}

const codeStyle: React.CSSProperties = { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', fontSize: 12.5, color: '#e8e8f4', fontFamily: 'ui-monospace, monospace' }
const calloutStyle: React.CSSProperties = { padding: '1rem 1.25rem', background: 'rgba(232,64,74,0.06)', border: '1px solid rgba(232,64,74,0.2)', borderRadius: 'var(--radius-lg)', fontSize: 14, lineHeight: 1.7, color: 'var(--muted)' }
const subhead: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }
const olStyle: React.CSSProperties = { margin: 0, paddingLeft: 20, color: 'var(--muted)', fontSize: 14, lineHeight: 1.9, display: 'flex', flexDirection: 'column', gap: 4 }
