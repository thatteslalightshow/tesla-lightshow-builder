import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://tesla-lightshow-builder-1yo3.vercel.app"
  ),
  title: {
    default: "ThatTeslaLightshow — Tesla Light Show Builder",
    template: "%s · ThatTeslaLightshow",
  },
  description: "Build custom Tesla light shows synced to your music. Export ready for USB.",
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
        <Analytics />
      </body>
    </html>
  );
}
