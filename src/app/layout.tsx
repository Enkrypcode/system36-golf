import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf Scoring System",
  description: "Tournament scoring for golf event operators.",
  icons: { icon: "/golf-scoring-icon.png", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
