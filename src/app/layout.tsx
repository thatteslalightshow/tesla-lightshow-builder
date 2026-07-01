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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Track />
        <Analytics />
      </body>
    </html>
  );
}
