import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Track from "@/components/Track";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://thatteslalightshow.com"
  ),
  title: {
    default: "ThatTeslaLightshow — Tesla Light Show Builder",
    template: "%s · ThatTeslaLightshow",
  },
  description: "Turn any song into a custom Tesla light show in minutes — no xLights. Auto-synced to the beat, previewed in 3D, exported ready for USB.",
  openGraph: {
    title: "ThatTeslaLightshow — Tesla Light Show Builder",
    description: "Turn any song into a custom Tesla light show in minutes — no xLights. Auto-synced to the beat, previewed in 3D, exported ready for USB.",
    siteName: "ThatTeslaLightshow",
    type: "website",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "That Lightshow — Tesla Lightshow Builder" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThatTeslaLightshow — Tesla Light Show Builder",
    description: "Turn any song into a custom Tesla light show in minutes — no xLights.",
    site: "@ThatTeslaLightshow",
    images: ["/brand/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Site-wide structured data (JSON-LD) so search engines understand the product, the brand, and the
// pricing — and can surface the "custom Tesla light show, no xLights" positioning as a rich result.
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://thatteslalightshow.com";
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "ThatTeslaLightshow",
      url: SITE_URL,
      logo: `${SITE_URL}/brand/logo.png`,
      sameAs: [
        "https://www.tiktok.com/@thatteslalightshow",
        "https://www.instagram.com/that.teslalightshow",
        "https://x.com/ThatTeslaLights",
        "https://www.facebook.com/ThatTeslaLightShow",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "ThatTeslaLightshow",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      name: "ThatTeslaLightshow — Tesla Light Show Builder",
      url: SITE_URL,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      description:
        "Turn any song into a custom Tesla light show in minutes — no xLights. Auto-synced to the beat, previewed in 3D, exported ready for USB.",
      offers: [
        { "@type": "Offer", name: "Pay-as-you-go", price: "3.99", priceCurrency: "USD", description: "First export free, then $3.99 per export." },
        { "@type": "Offer", name: "Creator (annual)", price: "59.99", priceCurrency: "USD", description: "Unlimited exports — $59.99/yr or $6.99/mo." },
      ],
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
        {children}
        <Track />
        <Analytics />
      </body>
    </html>
  );
}
