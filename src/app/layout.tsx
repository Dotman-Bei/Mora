import type { Metadata, Viewport } from "next";
import { Hedvig_Letters_Sans, Hedvig_Letters_Serif } from "next/font/google";
import { Footer } from "@/components/footer";
import { Chrome } from "@/components/header";
import { Providers } from "@/components/providers";
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
  title: { default: site.title, template: "%s | Mora" },
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

// Warm the connection to the RPC providers the browser will call first
// (claim links read the contract on load).
const rpcOrigins = [
  ...new Set(
    [process.env.NEXT_PUBLIC_TESTNET_RPC_URLS, process.env.NEXT_PUBLIC_MAINNET_RPC_URLS, "https://soroban-testnet.stellar.org"]
      .flatMap((v) => (v ?? "").split(","))
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) => {
        try {
          return new URL(u).origin;
        } catch {
          return null;
        }
      })
      .filter((o): o is string => !!o),
  ),
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${hedvigSans.variable} ${hedvigSerif.variable}`}>
      <head>
        {rpcOrigins.map((o) => (
          <link key={o} rel="preconnect" href={o} crossOrigin="anonymous" />
        ))}
      </head>
      <body className="overflow-x-hidden bg-background font-sans text-foreground antialiased">
        <Providers>
          <Chrome />
          <main className="mx-auto min-h-screen px-4 pt-[var(--banner-h,0px)] md:overflow-visible">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
