"use client";

import { useState } from "react";
import { Modal, ModalBody } from "@/components/modal";

/**
 * A button that opens a sheet with more about something: a row in a list, or a banner.
 * What the sheet shows is drawn by the server and handed in as `children`, so its buttons
 * (approve, delete) are the ordinary actions, and a revalidation redraws it in place.
 *
 * With `hidden` there is no button, but a sheet already open stays open — the last pending
 * challenge approved in it does not snatch the sheet away. `initialOpen` opens it on
 * arrival (a notification's link); `clearParam` then takes that parameter off the address
 * when it is closed, so a reload does not open it again.
 */
export function DetailSheet({
  title,
  trigger,
  triggerClassName = "",
  hidden = false,
  initialOpen = false,
  clearParam,
  children,
}: {
  title: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  hidden?: boolean;
  initialOpen?: boolean;
  clearParam?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const close = () => {
    setOpen(false);
    if (clearParam) {
      const url = new URL(window.location.href);
      if (url.searchParams.has(clearParam)) {
        url.searchParams.delete(clearParam);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    }
  };
  return (
    <>
      {!hidden && (
        <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={triggerClassName}>
          {trigger}
        </button>
      )}
      <Modal open={open} onClose={close} title={title}>
        <ModalBody className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</ModalBody>
      </Modal>
    </>
  );
}
