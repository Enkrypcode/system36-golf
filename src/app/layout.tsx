import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "System 36 Tournament Manager",
  description: "A score-entry workspace for golf tournament operators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
