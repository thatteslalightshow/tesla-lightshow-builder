import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tesla LightShow Builder",
  description: "Build custom Tesla light shows synced to your music. Export ready for USB.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
