"use client";

import { useState } from "react";
import { Modal, ModalBody } from "@/components/modal";
import { Button } from "@/components/ui";
import { kr } from "@/lib/money";
import { afterPaying, paymentMessage, type PayKind } from "@/lib/pay";

/**
 * "Betal" for one's fines or kontingent: which MobilePay Box, how much and what to write.
 * Paying happens in MobilePay; nothing here marks anything paid (`src/lib/pay.ts`).
 */
export function PayDialog({
  kind,
  box,
  amountKr,
  name,
  trigger,
  triggerClassName,
}: {
  kind: PayKind;
  box: string;
  /** Null when the team has not said what kontingent costs. */
  amountKr: number | null;
  /** Whoever pays, as the message should name them. */
  name: string;
  trigger: React.ReactNode;
  triggerClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const title = kind === "fines" ? "Betal dine bøder" : "Betal kontingent";
  const message = paymentMessage(kind, name);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="drawer">
        <ModalBody className="space-y-4 text-sm text-slate-700">
          <p>Betal med MobilePay til holdets box:</p>
          <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            <Row label="MobilePay Box" value={box} copy />
            {amountKr !== null && <Row label="Beløb" value={kr(amountKr)} />}
            <Row label="Skriv i beskeden" value={message} copy />
          </dl>
          <p className="text-slate-500">{afterPaying(kind)}</p>
        </ModalBody>
      </Modal>
    </>
  );
}

function Row({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // No clipboard here: the value is on screen to type.
    }
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="truncate text-base font-semibold text-slate-900">{value}</dd>
      </div>
      {copy && (
        <Button type="button" variant="ghost" onClick={copyValue} aria-label={`Kopiér ${label.toLowerCase()}`}>
          {copied ? "Kopieret ✓" : "Kopiér"}
        </Button>
      )}
    </div>
  );
}
