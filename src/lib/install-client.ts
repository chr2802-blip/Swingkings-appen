"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { guideFor, type Guide } from "@/lib/install";

/**
 * The browser's half of installing the app. Chrome on Android hands over its install
 * prompt as `beforeinstallprompt` — often before React is running, so a script in the root
 * layout (`CAPTURE_INSTALL_PROMPT` in `@/lib/install`) catches it on `window.__installPrompt` and this store
 * picks it up from there.
 *
 * What we remember is per phone and only a convenience (localStorage, which may be empty
 * or refuse): that the app was installed, and when the offer after login was put off.
 */

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __installPrompt?: PromptEvent | null;
  }
}



const CHANGED = "swingkings:install";
const INSTALLED_KEY = "swingkings:installed";
const LATER_KEY = "swingkings:install-later";
const LATER_DAYS = 4;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window: we simply ask again next time */
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/** Opened from the home screen, Android and iPhone alike. */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Chrome can hold its prompt back for the first moments of a visit. Waits for it, a little,
 * so a tap right after the page opens still gets the one-tap install rather than the guide.
 * Short enough that the tap still counts as the user's own when the prompt is shown.
 */
export function waitForPrompt(ms: number) {
  return new Promise<boolean>((resolve) => {
    if (window.__installPrompt) return resolve(true);
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener(CHANGED, done);
      resolve(Boolean(window.__installPrompt));
    };
    const timer = setTimeout(done, ms);
    window.addEventListener(CHANGED, done);
  });
}

export type InstallState = {
  /** False until the browser has been asked, so the server's first paint stays put. */
  ready: boolean;
  guide: Guide;
  standalone: boolean;
  /** Installed from this browser before (or right now): the offer after login goes quiet. */
  installed: boolean;
  /** Chrome holds an install prompt we can open with one tap. */
  canPrompt: boolean;
  /** Put off on this phone within the last few days. */
  later: boolean;
};

export function useInstall(serverGuide: Guide = "desktop"): InstallState & {
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
  putOff: () => void;
  markInstalled: () => void;
} {
  const canPrompt = useSyncExternalStore(
    subscribe,
    () => Boolean(window.__installPrompt),
    () => false,
  );
  const installedFlag = useSyncExternalStore(
    subscribe,
    () => read(INSTALLED_KEY) === "1",
    () => false,
  );
  const [env, setEnv] = useState<{ ready: boolean; guide: Guide; standalone: boolean; later: boolean }>({
    ready: false,
    guide: serverGuide,
    standalone: false,
    later: false,
  });

  useEffect(() => {
    const standalone = isStandalone();
    if (standalone) write(INSTALLED_KEY, "1");
    const putOffAt = Number(read(LATER_KEY) ?? 0);
    setEnv({
      ready: true,
      guide: guideFor(navigator.userAgent, navigator.maxTouchPoints),
      standalone,
      later: Date.now() - putOffAt < LATER_DAYS * 24 * 60 * 60 * 1000,
    });
  }, []);

  return {
    ...env,
    installed: env.standalone || installedFlag,
    canPrompt,
    async prompt() {
      const event = window.__installPrompt;
      if (!event) return "unavailable";
      await event.prompt();
      const { outcome } = await event.userChoice;
      // A prompt can be shown once; Chrome sends a fresh one later if it was turned down.
      window.__installPrompt = null;
      if (outcome === "accepted") write(INSTALLED_KEY, "1");
      window.dispatchEvent(new Event(CHANGED));
      return outcome;
    },
    markInstalled() {
      write(INSTALLED_KEY, "1");
      window.dispatchEvent(new Event(CHANGED));
    },
    putOff() {
      write(LATER_KEY, String(Date.now()));
      setEnv((current) => ({ ...current, later: true }));
    },
  };
}
