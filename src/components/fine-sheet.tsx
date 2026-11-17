"use client";

import { useRef, useState, type ReactNode } from "react";
import { loadFineDetails } from "@/app/actions/fine-details";
import { Modal, ModalBody } from "@/components/modal";
import { SkeletonBlock } from "@/components/skeleton";

type Details = { status: "loading" } | { status: "ready"; node: ReactNode } | { status: "gone" } | { status: "failed" };

/**
 * A fine row's button and the sheet it opens, like `DetailSheet`, except that what the sheet
 * shows is fetched from the server when it is opened (`loadFineDetails`) instead of drawn
 * for every row beforehand. Each opening fetches it anew, so it is never stale.
 */
export function FineSheet({
  fineId,
  title,
  trigger,
  triggerClassName = "",
}: {
  fineId: string;
  title: string;
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<Details>({ status: "loading" });
  /** Bumped on every opening and closing, so an answer to an earlier one is dropped. */
  const generation = useRef(0);

  const load = () => {
    const current = ++generation.current;
    setDetails({ status: "loading" });
    loadFineDetails(fineId).then(
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
            <p className="text-sm text-slate-600">Bøden findes ikke længere.</p>
          ) : (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-red-600">
                Bøden kunne ikke hentes. Tjek forbindelsen.
              </p>
              <button type="button" onClick={load} className="text-sm font-medium text-[var(--accent-text)] underline">
                Prøv igen
              </button>
            </div>
          )}
        </ModalBody>
      </Modal>
    </>
  );
}
