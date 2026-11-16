"use client";

import { useEffect, useState } from "react";
import { Modal, ModalBody } from "@/components/modal";
import { Button, buttonClass, Input } from "@/components/ui";

/**
 * "Tilføj til kalender": subscribes the phone's calendar to the team's activities. The
 * server only knows the path; the address in front is wherever the app is open. On an
 * iPhone, a Mac and in Outlook the webcal:// link subscribes; Google takes it on its own
 * page; and the link can be copied into anything else.
 */
export function CalendarButton({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  const https = `https://${host}${path}`;
  const webcal = `webcal://${host}${path}`;
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
    } catch {
      // No clipboard: the field is selectable.
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Tilføj til kalender
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tilføj til kalender" size="drawer">
        <ModalBody className="space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-slate-600">
            Abonnér på holdets aktiviteter, så de står i din kalender og følger med, når noget flytter sig eller bliver aflyst.
          </p>
          <div className="grid gap-2">
            <a href={webcal} className={buttonClass("primary", "w-full")}>
              Abonnér (iPhone, Mac, Outlook)
            </a>
            <a href={google} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "w-full")}>
              Google Kalender ↗
            </a>
          </div>
          <div className="space-y-2">
            <Input readOnly value={https} onFocus={(event) => event.currentTarget.select()} aria-label="Kalenderlink" />
            <Button type="button" variant="ghost" onClick={copy}>
              {copied ? "Kopieret ✓" : "Kopiér link"}
            </Button>
            <p className="text-xs text-slate-500">Linket er dit eget — del det ikke. Det holder op med at virke, hvis du forlader holdet.</p>
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}
