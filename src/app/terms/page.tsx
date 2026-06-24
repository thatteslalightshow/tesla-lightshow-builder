import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using ThatTeslaLightshow.',
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 24, 2026"
      intro="These terms govern your use of ThatTeslaLightshow. By creating an account or using the service, you agree to them. Please read the music-rights and vehicle-safety sections carefully."
    >
      <h2>1. The service</h2>
      <p>ThatTeslaLightshow lets you create custom light-show sequences for compatible Tesla vehicles and export them as files you load onto a USB drive. We provide the software that builds the light sequence; you supply the music and run the show on your own vehicle.</p>

      <h2>2. Your account</h2>
      <p>You are responsible for your account and for keeping your login secure. You must provide accurate information and be at least 13 years old to use the service.</p>

      <h2>3. Payments</h2>
      <ul>
        <li>Your first export is free. After that, exports are available per-export or through a subscription, at the prices shown at checkout.</li>
        <li>Payments are processed by Stripe. Subscriptions renew automatically until cancelled; you can cancel anytime and keep access through the end of your billing period.</li>
        <li>Because exported files are delivered digitally and immediately, payments are generally non-refundable except where required by law or at our discretion.</li>
      </ul>

      <h2>4. Music &amp; content rights</h2>
      <p><strong>You provide your own music.</strong> When you upload an audio file, you confirm that you own it or have the rights to use it to create a personal light show. We do not own, license, sell, or claim any rights to your music. We process your audio only to generate and time your light show, and we return your same audio bundled with the light-sequence file we create — the light sequence is our product, not the music.</p>
      <p>You retain ownership of the shows you create. You are solely responsible for ensuring you have the rights to any audio you upload, share, or distribute. You agree not to upload audio you do not have the right to use.</p>

      <h2>5. Sharing &amp; community shows</h2>
      <p>If you make a show public or list it in the community gallery, you grant other users permission to view and acquire a copy of that show. You represent and warrant that you hold all rights necessary to share any audio included with it. You — not ThatTeslaLightshow — are responsible for the content you choose to make public. We may remove any show at our discretion.</p>

      <h2>6. Vehicle safety — important</h2>
      <p>Some light shows can command your vehicle&apos;s <strong>physical closures</strong> — doors, windows, mirrors, the liftgate/frunk, and the charge port — to move. <strong>You run light shows entirely at your own risk.</strong> Before running any show:</p>
      <ul>
        <li>Make sure your vehicle has clear space around it for any doors, windows, or the liftgate to move safely.</li>
        <li>Keep people, pets, and objects away from moving parts.</li>
        <li>Follow Tesla&apos;s own guidance and safety warnings for custom light shows.</li>
      </ul>
      <p>ThatTeslaLightshow is not responsible for any damage, injury, or loss resulting from running a light show or from the movement of your vehicle&apos;s closures. We design shows to stay within Tesla&apos;s published limits, but you are responsible for safe operation.</p>

      <h2>7. Acceptable use</h2>
      <p>Don&apos;t misuse the service: no unlawful content, no infringing on others&apos; rights, no attempting to break, overload, or reverse-engineer the platform, and no reselling the service itself.</p>

      <h2>8. Not affiliated with Tesla</h2>
      <p>ThatTeslaLightshow is an independent product and is <strong>not affiliated with, endorsed by, or sponsored by Tesla, Inc.</strong> &quot;Tesla&quot; and related marks are trademarks of Tesla, Inc. Vehicle compatibility and the light-show feature are controlled by Tesla and may change.</p>

      <h2>9. Disclaimers</h2>
      <p>The service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind. We do not guarantee that every show will work on every vehicle or software version, or that the service will be uninterrupted or error-free.</p>

      <h2>10. Limitation of liability</h2>
      <p>To the maximum extent permitted by law, ThatTeslaLightshow will not be liable for any indirect, incidental, or consequential damages, or for vehicle damage or personal injury arising from your use of the service. Our total liability for any claim will not exceed the amount you paid us in the 12 months before the claim.</p>

      <h2>11. Termination</h2>
      <p>You can stop using the service and delete your account at any time. We may suspend or terminate accounts that violate these terms.</p>

      <h2>12. Changes</h2>
      <p>We may update these terms. We will update the &quot;last updated&quot; date, and continued use after changes means you accept them.</p>

      <h2>13. Contact</h2>
      <p>Questions? Reach us on Instagram or TikTok at <strong>@ThatTeslaLightshow</strong>.</p>
    </LegalPage>
  )
}
