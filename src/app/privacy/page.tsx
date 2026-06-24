import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How ThatTeslaLightshow collects, uses, and protects your information.',
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 24, 2026"
      intro="This policy explains what we collect when you use ThatTeslaLightshow, how we use it, and the choices you have. By using the service you agree to this policy."
    >
      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account information</strong> — your email address and, if you sign in with Google, the basic profile info Google shares (name, email). We never receive your Google password.</li>
        <li><strong>Content you create</strong> — the light shows you build, their settings, and any audio files you upload to make a show.</li>
        <li><strong>Payment information</strong> — when you buy an export or subscribe, payments are processed by <strong>Stripe</strong>. We do not see or store your full card number; Stripe handles it and shares limited details with us (e.g., that a payment succeeded, the billing country, the last digits).</li>
        <li><strong>Usage &amp; analytics</strong> — basic, privacy-friendly analytics about how the site is used (pages viewed, referrers, device type) and a <strong>coarse location (country / region)</strong> derived from your connection. We do <strong>not</strong> store your raw IP address for analytics.</li>
        <li><strong>Cookies</strong> — we use cookies that are necessary to keep you signed in. We do not use third-party advertising cookies.</li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To provide the service — build, preview, store, and export your light shows.</li>
        <li>To process payments and manage subscriptions.</li>
        <li>To operate, secure, and improve the product.</li>
        <li>To understand, in aggregate, where our users are and how they use the site — which may inform future features and communications.</li>
      </ul>

      <h2>How your information is shared</h2>
      <p>We do not sell your personal information. We share data only with the service providers that run the product on our behalf:</p>
      <ul>
        <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>Vercel</strong> — hosting and privacy-friendly web analytics.</li>
        <li><strong>Google</strong> — only if you choose to sign in with Google.</li>
      </ul>
      <p>We may also disclose information if required by law, or to protect the rights, safety, and property of our users or ourselves.</p>

      <h2>Audio you upload</h2>
      <p>Audio files you upload are used to generate and sync your light show, and are bundled back into the show package you download. You are responsible for having the rights to any audio you upload. See our <a href="/terms">Terms of Service</a> for details.</p>

      <h2>Data retention</h2>
      <p>We keep your account and content for as long as your account is active. You can delete individual shows at any time, and you can request deletion of your account by contacting us.</p>

      <h2>Security</h2>
      <p>We use industry-standard measures to protect your data, including encrypted connections and access controls. No system is perfectly secure, but we work to safeguard your information.</p>

      <h2>Your choices &amp; rights</h2>
      <p>You can access and edit your account and shows at any time, and request a copy or deletion of your personal data. Depending on where you live (e.g., the EU/UK or California), you may have additional rights under laws such as the GDPR or CCPA. To exercise any of these, contact us below.</p>

      <h2>Children</h2>
      <p>The service is not directed to children under 13, and we do not knowingly collect information from them.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy from time to time. We will revise the &quot;last updated&quot; date above, and significant changes will be communicated where appropriate.</p>

      <h2>Contact</h2>
      <p>Questions about this policy, or want to access or delete your data? Reach us on Instagram or TikTok at <strong>@ThatTeslaLightshow</strong>.</p>
    </LegalPage>
  )
}
