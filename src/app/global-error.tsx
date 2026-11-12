"use client";

import { useEffect } from "react";
import "./globals.css";

/** Don't reload again within this long of the last automatic reload: no reload loops. */
const RELOAD_GUARD_MS = 30_000;
const RELOAD_KEY = "swingkings:error-reload";

/**
 * Replaces the root layout when something breaks above every other error boundary, which
 * would otherwise show Next's bare "Application error" page.
 *
 * The usual cause is a new deploy while the app is open (it lives for days as a home-screen
 * app): the browser still runs the old build's JavaScript and gets pages from the new one.
 * A fresh load fixes that, so the first time this happens the page reloads by itself; if it
 * breaks again straight after, it shows a button instead of reloading in a loop.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
    } catch {
      // Storage blocked: fall through to the button, never risk a loop.
      return;
    }
    if (Date.now() - last < RELOAD_GUARD_MS) return;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <html lang="da">
      <body className="flex min-h-screen items-center justify-center bg-[#f8f6f1] p-6 text-center text-slate-900 antialiased">
        <div className="max-w-sm space-y-4">
          <p className="text-4xl" aria-hidden>
            🤕
          </p>
          <p>Noget gik galt. Måske er appen lige blevet opdateret.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#2563ab] px-5 py-2.5 font-medium text-white"
          >
            Genindlæs
          </button>
        </div>
      </body>
    </html>
  );
}
