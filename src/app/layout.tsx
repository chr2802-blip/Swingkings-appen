import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SafeAnalytics } from "@/components/safe-analytics";
import { getCurrentUser } from "@/lib/auth";
import { BANDS, DEFAULT_THEME, darkBand } from "@/lib/theme";
import { CAPTURE_INSTALL_PROMPT } from "@/lib/install";
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

async function currentTheme() {
  return (await getCurrentUser())?.teamTheme ?? DEFAULT_THEME;
}

/** On a dark frame the iPhone's clock and battery go white, over our own header. */
export async function generateMetadata(): Promise<Metadata> {
  const dark = darkBand(await currentTheme());
  return {
    title: "Swingkings",
    description: "Bødekasse, opgaver, chat og feed for holdet.",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Swingkings", statusBarStyle: dark ? "black-translucent" : "default" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  return {
    themeColor: BANDS[await currentTheme()],
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  };
}

/**
 * The team's colour goes on the document itself, because sheets are portalled into
 * <body> and would otherwise wear the previous team's colours.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await currentTheme();
  return (
    <html lang="da" data-theme={theme} className={heading.variable}>
      <body className="min-h-screen text-slate-900 antialiased">
        {/* Before React: Chrome's install prompt can arrive before anything hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        {/* Under the phone's clock on pages with no header, so white text there has its frame. */}
        <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-[var(--band)]" />
        {children}
        <SafeAnalytics />
      </body>
    </html>
  );
}
