import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'FAQ — Tesla Light Show Builder',
  description: 'Common questions about building, exporting, and running custom Tesla light shows.',
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <h2 style={{ fontSize: '1.02rem', marginBottom: '0.5rem' }}>{q}</h2>
      <div style={{ fontSize: 14.5, lineHeight: 1.8, color: 'var(--muted)' }}>{children}</div>
    </div>
  )
}

export default function FaqPage() {
  return (
    <LegalPage
      title="Frequently asked questions"
      intro="Everything you need to know about building a show and running it on your Tesla. Still stuck? Check the step-by-step guide or reach out to us on social."
    >
      <Q q="What is ThatTeslaLightshow?">
        It&apos;s a web app that builds custom light shows for your Tesla, synced to your music. You pick a song, our engine choreographs the lights (and optionally the doors, windows, and other closures) to the beat, and you export a file package you load onto a USB drive to run on your car.
      </Q>

      <Q q="How does it work?">
        Upload a song, preview your show in 3D in the browser, then export. You get a <strong>LightShow</strong> folder (a <code>.fseq</code> sequence + your audio) to copy onto a USB drive. Plug it into your Tesla and start the show from the Toybox.
      </Q>

      <Q q="Which Teslas are supported?">
        Model S (2021+), Model 3, Model X (2021+), Model Y, and Cybertruck, running Tesla software v11.0 (2021.44.25) or newer. Shows are not model-specific — a single show runs on any supported vehicle, and each car performs the lights and closures it has.
      </Q>

      <Q q="Is it free?">
        You can build and preview shows for free, forever. Your <strong>first export is free</strong>. After that it&apos;s $2.99 per export, or you can subscribe to Creator for unlimited exports (and free community-show downloads). See <Link href="/pricing">pricing</Link>.
      </Q>

      <Q q="Do the doors and windows really move?">
        Yes — if you enable <strong>Auto-choreograph closures</strong>, the show can open and dance your doors, windows, mirrors, liftgate/frunk, and charge port to the music, staying within Tesla&apos;s published limits. Because these are physical movements, <strong>always make sure your car has clear space and keep people and objects away.</strong> You run shows at your own risk — see our <Link href="/terms">Terms</Link>.
      </Q>

      <Q q="What music can I use?">
        Upload an MP3 or WAV (WAV is best). We automatically convert it to the 44.1 kHz WAV format Tesla needs so it stays perfectly in sync. <strong>You provide your own music</strong> — we don&apos;t supply songs, and you&apos;re responsible for having the rights to the audio you upload.
      </Q>

      <Q q="How do I load a show onto my Tesla?">
        Format a USB drive as exFAT or FAT32 (not NTFS), copy the <strong>LightShow</strong> folder to its root, plug it into a front USB or the glovebox port, then tap <strong>Toybox → Light Show → Schedule Show</strong>. Full walkthrough in the <Link href="/guide">guide</Link>.
      </Q>

      <Q q="Can I share or buy community shows?">
        Yes. You can make your shows public in the community gallery, and acquire shows others have shared. When you add a community show to your library, it&apos;s tailored to your Tesla model automatically. Subscribers get community downloads free; otherwise it&apos;s $2.99.
      </Q>

      <Q q="Can I cancel my subscription?">
        Anytime, from your dashboard — you keep access through the end of your billing period.
      </Q>

      <Q q="It didn&apos;t work on my car — what should I check?">
        Make sure: your Tesla software is v11.0+; the USB is exFAT/FAT32 (not NTFS) with a base-level <strong>LightShow</strong> folder; the <code>.fseq</code> and audio filenames match; and there&apos;s no TeslaCam folder on the drive. The <Link href="/guide">guide</Link> covers formatting and common issues.
      </Q>

      <Q q="Is my data safe?">
        We use encrypted connections and trusted providers (payments via Stripe, never stored by us). See our <Link href="/privacy">Privacy Policy</Link> for details.
      </Q>
    </LegalPage>
  )
}
