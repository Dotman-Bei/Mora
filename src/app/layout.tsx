import type { Metadata, Viewport } from "next";
import { Hedvig_Letters_Sans, Hedvig_Letters_Serif } from "next/font/google";
import { Footer } from "@/components/footer";
import { Chrome } from "@/components/header";
import { Providers } from "@/components/providers";
import { NETWORK } from "@/lib/config";
import { site } from "@/lib/site.config";
import "./globals.css";

// One weight per face. display: "optional" trades a fallback on slow first
// visits for zero layout shift (frontend.md §3).
const hedvigSans = Hedvig_Letters_Sans({
  weight: "400",
  subsets: ["latin"],
  display: "optional",
  variable: "--font-hedvig-sans",
  fallback: ["system-ui", "arial"],
});
const hedvigSerif = Hedvig_Letters_Serif({
  weight: "400",
  subsets: ["latin"],
  display: "optional",
  variable: "--font-hedvig-serif",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: "%s | Portaj" },
  description: site.description,
  openGraph: { title: site.title, description: site.description, siteName: site.name, type: "website" },
  twitter: { card: "summary_large_image", title: site.title, description: site.description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

// Warm the connections the browser makes first: RPC and Horizon.
const origins = [NETWORK.rpcUrl, NETWORK.horizonUrl].map((u) => new URL(u).origin);

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${hedvigSans.variable} ${hedvigSerif.variable}`}>
      <head>
        {origins.map((o) => (
          <link key={o} rel="preconnect" href={o} crossOrigin="anonymous" />
        ))}
      </head>
      <body className="overflow-x-hidden bg-background font-sans text-foreground antialiased">
        <Providers>
          <Chrome />
          <main className="mx-auto min-h-screen px-4 md:overflow-visible">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
