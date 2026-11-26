import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { siteName } from "@/lib/site";
import "./globals.css";

const body = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0a10" };

export function generateMetadata(): Metadata {
  return { title: `${siteName()} — administration`, robots: { index: false, follow: false } };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={body.variable}>
      <body>{children}</body>
    </html>
  );
}
