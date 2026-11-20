"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadChallengeDetails, loadFineDetails } from "@/app/actions/fine-details";
import { SHEET_EVENT } from "@/components/fresh";
import { Modal, ModalBody } from "@/components/modal";
import { SkeletonBlock } from "@/components/skeleton";

type Details = { status: "loading" } | { status: "ready"; node: ReactNode } | { status: "gone" } | { status: "failed" };

/** What each kind of row opens: how it is fetched, and how it is said when it is not there. */
const KINDS = {
  fine: { load: loadFineDetails, gone: "Bøden findes ikke længere.", failed: "Bøden kunne ikke hentes. Tjek forbindelsen." },
  challenge: {
    load: loadChallengeDetails,
    gone: "Udfordringen findes ikke længere.",
    failed: "Udfordringen kunne ikke hentes. Tjek forbindelsen.",
  },
} as const;

/**
 * A history row's button and the sheet it opens — a fine's, or a challenge's still waiting —
 * like `DetailSheet`, except that what the sheet shows is fetched from the server when it is
 * opened (`loadFineDetails`, `loadChallengeDetails`) instead of drawn for every row
 * beforehand. Each opening fetches it anew, so it is never stale. A press elsewhere that
 * moves the page (an approval: the history, with its fines) closes it, as it does every sheet.
 *
 * What the server draws in it may use only client components the page already has (else
 * "not in the React Client Manifest"): the sheets' buttons are `ActionButton`s.
 */
export function FineSheet({
  fineId,
  kind = "fine",
  title,
  trigger,
  triggerClassName = "",
}: {
  /** The fine's id, or the challenge's with `kind="challenge"`. */
  fineId: string;
  kind?: keyof typeof KINDS;
  title: string;
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const what = KINDS[kind];
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<Details>({ status: "loading" });
  /** Bumped on every opening and closing, so an answer to an earlier one is dropped. */
  const generation = useRef(0);

  const load = () => {
    const current = ++generation.current;
    setDetails({ status: "loading" });
    what.load(fineId).then(
      (node) => {
        if (current === generation.current) setDetails(node ? { status: "ready", node } : { status: "gone" });
      },
      () => {
        if (current === generation.current) setDetails({ status: "failed" });
      },
    );
  };
  const show = () => {
    setOpen(true);
    load();
  };
  const close = () => {
    generation.current += 1;
    setOpen(false);
  };
  useEffect(() => {
    const away = () => {
      generation.current += 1;
      setOpen(false);
    };
    window.addEventListener(SHEET_EVENT, away);
    return () => window.removeEventListener(SHEET_EVENT, away);
  }, []);

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={show} className={triggerClassName}>
        {trigger}
      </button>
      <Modal open={open} onClose={close} title={title}>
        <ModalBody className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {details.status === "ready" ? (
            details.node
          ) : details.status === "loading" ? (
            <div aria-busy="true" aria-label="Henter" className="space-y-4">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-14 w-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock className="h-5 w-2/3" />
                  <SkeletonBlock className="h-7 w-1/3" />
                </div>
              </div>
              <SkeletonBlock className="h-40" />
            </div>
          ) : details.status === "gone" ? (
            <p className="text-sm text-slate-600">{what.gone}</p>
          ) : (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-red-600">
                {what.failed}
              </p>
              <button type="button" onClick={load} className="press-text tap-inline text-sm font-medium text-[var(--accent-text)] underline">
                Prøv igen
              </button>
            </div>
          )}
        </ModalBody>
      </Modal>
    </>
  );
}
