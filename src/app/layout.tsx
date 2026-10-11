import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { getCurrentUser } from "@/lib/auth";
import { BAND, DEFAULT_THEME } from "@/lib/theme";
import "./globals.css";

/**
 * Vendored rather than fetched through `next/font/google`, which makes a live request to
 * Google Fonts on every build — a network flake there would fail the deploy.
 */
const heading = localFont({
  src: "./fonts/quicksand-variable.woff2",
  weight: "500 700",
  variable: "--font-heading",
  display: "swap",
});

const display = localFont({
  src: "./fonts/fraunces-variable.woff2",
  weight: "500 700",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Swingkings",
  description: "Bødekasse, opgaver, chat og feed for holdet.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Swingkings", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: BAND,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * The team's colour goes on the document itself, because sheets are portalled into
 * <body> and would otherwise wear the previous team's colours.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="da" data-theme={user?.teamTheme ?? DEFAULT_THEME} className={`${heading.variable} ${display.variable}`}>
      <body className="min-h-screen text-slate-900 antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
