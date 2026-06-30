import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Contact — ThatTeslaLightshow',
  description: 'Get in touch with ThatTeslaLightshow — support, billing, and social.',
}

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      intro="Real people, happy to help — we usually respond within 48–72 business hours."
    >
      <h2>Support &amp; help</h2>
      <p>Questions about building a show, exporting, running it on your Tesla, or your account — email <a href="mailto:support@thatteslalightshow.com"><strong>support@thatteslalightshow.com</strong></a>. Our <Link href="/faq">FAQ</Link> and <Link href="/guide">setup guide</Link> answer most common questions instantly.</p>
      <p><strong>Run into trouble?</strong> Reach out to support — we&apos;ll help you get your show running. And if the problem&apos;s on our end, we&apos;ll make it right.</p>

      <h2>Billing &amp; subscriptions</h2>
      <p>For payments, refunds, or anything about your Creator plan, email <a href="mailto:billing@thatteslalightshow.com"><strong>billing@thatteslalightshow.com</strong></a>. You can also manage or cancel your plan anytime from your <Link href="/dashboard">dashboard</Link>.</p>

      <h2>Legal &amp; copyright</h2>
      <p>For legal, copyright, or content-takedown matters, email <a href="mailto:legal@thatteslalightshow.com"><strong>legal@thatteslalightshow.com</strong></a>.</p>

      <h2>Social</h2>
      <p>Follow along — or just say hi — on Instagram and TikTok at <strong>@ThatTeslaLightshow</strong>. We love featuring community shows, so tag us when you run yours.</p>

      <p style={{ marginTop: '2rem' }}>For privacy or data requests, see our <Link href="/privacy">Privacy Policy</Link>; for our terms, see our <Link href="/terms">Terms of Service</Link>.</p>
    </LegalPage>
  )
}
