import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};
export const metadata: Metadata = {
  title: "EnkrypScore | Golf Scoring System",
  description: "EnkrypScore — Golf Scoring System for tournament operators.",
  icons: { icon: "/golf-scoring-icon.png", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
