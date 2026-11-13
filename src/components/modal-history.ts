/**
 * The browser's back button closes the sheet on top instead of leaving the page behind it.
 *
 * While any sheet is open the page holds one extra history entry — one, however many
 * sheets, since a drawer hands over to the dialog it opens. Back pops it and closes the
 * top sheet; a sheet closed any other way (Luk, Annuller, a saved form) takes the entry
 * away again, so no dead step is left behind.
 */
const KEY = "swingkingsSheet";

type Entry = { id: string; href: string; length: number };

const sheets: { close: () => void }[] = [];
let entry: Entry | null = null;
/** Our own `history.back()` is on its way; its popstate is not the user's. */
let unwinding = false;
/** What the page's own entry had for `history.scrollRestoration`, to give back on return. */
let restoration: ScrollRestoration | null = null;
let scheduled = false;
let listening = false;
let counter = 0;

/**
 * Whether the browser still stands on the entry we pushed. A server action replaces the
 * entry's state (Next drops what it does not know), so the mark alone is not enough: an
 * unchanged address and history length say the same. A navigation changes one of them,
 * and then the entry is no longer ours to take away.
 */
function standsOnEntry(ours: Entry) {
  const state = window.history.state as Record<string, unknown> | null;
  if (state?.[KEY] === ours.id) return true;
  return window.location.href === ours.href && window.history.length === ours.length;
}

function reconcile() {
  scheduled = false;
  if (unwinding) return; // its popstate reconciles
  if (sheets.length > 0 && !entry) {
    const id = `${Date.now()}-${++counter}`;
    // Coming back to the page's entry must not put the scroll back where it was when the
    // sheet opened: the page may have been scrolled since (the sheet's own close is a
    // step back that arrives a moment later). The new entry keeps the browser's default.
    restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.history.pushState({ [KEY]: id }, "");
    window.history.scrollRestoration = restoration;
    entry = { id, href: window.location.href, length: window.history.length };
  } else if (sheets.length === 0 && entry) {
    const ours = entry;
    entry = null;
    if (standsOnEntry(ours)) {
      unwinding = true;
      window.history.back();
    }
  }
}

// Deferred, so a drawer closing and a dialog opening in the same press share the entry.
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(reconcile, 0);
}

function onPopState() {
  if ((unwinding || entry) && restoration) {
    window.history.scrollRestoration = restoration;
    restoration = null;
  }
  if (unwinding) {
    unwinding = false;
    schedule();
    return;
  }
  if (!entry) return;
  entry = null;
  sheets.at(-1)?.close();
  // A sheet beneath, or one that would not close, gets a fresh entry.
  schedule();
}

/** Call when a sheet opens; the function returned is for when it is closed or unmounted. */
export function holdHistoryEntry(close: () => void): () => void {
  if (!listening) {
    listening = true;
    window.addEventListener("popstate", onPopState);
  }
  const sheet = { close };
  sheets.push(sheet);
  schedule();
  return () => {
    const at = sheets.indexOf(sheet);
    if (at !== -1) sheets.splice(at, 1);
    schedule();
  };
}
