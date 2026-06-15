import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tesla LightShow Builder",
  description: "Build and export custom Tesla light shows synced to your music",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
