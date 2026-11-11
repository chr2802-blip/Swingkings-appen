/**
 * Which "add Swingkings to the home screen" guide a phone needs, read from its user agent.
 * Pure, so the server can pick the guide for the first paint and the tests can pin it
 * down; the browser refines it with `maxTouchPoints`, since an iPad asks for the
 * desktop site and calls itself a Mac.
 *
 * - `android-*`: Chrome and its cousins offer a real install prompt (`beforeinstallprompt`);
 *   the guide is only for when they do not.
 * - `ios-*`: there is no prompt on an iPhone. Safari, Chrome and the others all reach
 *   "Føj til hjemmeskærm" through their share sheet, each from a different spot.
 * - `in-app`: Facebook, Instagram, Messenger, Snapchat… open links in a web view that cannot
 *   install anything; the guide is to open the page in the phone's real browser.
 */

export type Guide =
  | "ios-safari"
  | "ios-chrome"
  | "ios-other"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-other"
  | "in-app"
  | "desktop";

const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|MessengerForiOS|Snapchat|TikTok|musical_ly|Bytedance|LinkedInApp|Line\/|GSA\/|Twitter|Pinterest/i;

export function isIos(ua: string, maxTouchPoints = 0) {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

export function guideFor(ua: string, maxTouchPoints = 0): Guide {
  const ios = isIos(ua, maxTouchPoints);
  const android = /Android/i.test(ua);
  if (!ios && !android) return "desktop";
  // An Android web view says "; wv)"; it cannot install either.
  if (IN_APP.test(ua) || (android && /; wv\)/.test(ua))) return "in-app";
  if (ios) {
    if (/CriOS/i.test(ua)) return "ios-chrome";
    if (/FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave/i.test(ua)) return "ios-other";
    return /Safari/i.test(ua) ? "ios-safari" : "in-app";
  }
  if (/SamsungBrowser/i.test(ua)) return "android-samsung";
  if (/Firefox/i.test(ua)) return "android-firefox";
  if (/Chrome/i.test(ua) && !/EdgA|OPR|YaBrowser|MiuiBrowser|HuaweiBrowser/i.test(ua)) return "android-chrome";
  return "android-other";
}

export function isPhone(guide: Guide) {
  return guide !== "desktop";
}

export function isIosGuide(guide: Guide) {
  return guide.startsWith("ios-");
}


/**
 * Run inline in the root layout, before React: Chrome's `beforeinstallprompt` is kept on
 * `window.__installPrompt` for the "Hent appen" button (`src/lib/install-client.ts`), and
 * the service worker is registered on every page so the app is installable from the first
 * visit, not only once notifications are turned on.
 */
export const CAPTURE_INSTALL_PROMPT = `
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  window.__installPrompt = e;
  window.dispatchEvent(new Event("swingkings:install"));
});
window.addEventListener("appinstalled", function () {
  window.__installPrompt = null;
  try { localStorage.setItem("swingkings:installed", "1"); } catch (_) {}
  window.dispatchEvent(new Event("swingkings:install"));
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
}`;
