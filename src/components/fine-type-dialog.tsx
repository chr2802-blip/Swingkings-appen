"use client";

import { useState } from "react";
import { DialogForm, FormDialog } from "@/components/form-dialog";
import { Modal } from "@/components/modal";
import { ActionButton } from "@/components/action-button";
import { Field, Input, Textarea } from "@/components/ui";
import { removeFineType, saveFineType } from "@/app/actions/fines";
import { kr } from "@/lib/money";

type FineType = { id: string; name: string; description: string | null; units: number };

/**
 * The catalogue's dialog. Without a `fineType` it is the "+ Ny bøde" row that makes one.
 * With one, `children` is the fine's row and the whole row is the button: a tap opens the
 * fine to be changed, and deleting it is in there too — as a fine in the history is opened.
 */
export function FineTypeDialog({
  finePriceKr,
  fineType,
  children,
}: {
  finePriceKr: number;
  fineType?: FineType;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!fineType) {
    return (
      <FormDialog
        trigger="+ Ny bøde"
        triggerVariant="ghost"
        // A new one is made from the catalogue's last row, so its button is that whole row.
        triggerClassName="min-h-15 w-full rounded-none! text-[var(--accent-text)]!"
        title="Ny bøde i kataloget"
        action={saveFineType}
        submitLabel="Gem"
      >
        <FineTypeFields finePriceKr={finePriceKr} />
      </FormDialog>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="press-card flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {children}
        <span aria-hidden className="text-slate-300">
          ›
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ret bøde">
        {open && (
          <DialogForm action={saveFineType} submitLabel="Gem" onDone={() => setOpen(false)} onCancel={() => setOpen(false)}>
            <input type="hidden" name="id" value={fineType.id} />
            <FineTypeFields finePriceKr={finePriceKr} fineType={fineType} />
            {/* The confirmation is drawn in <body>, but React still bubbles its submit up
                through here to the form around it — which would save as well as delete. */}
            <div className="border-t border-slate-100 pt-4" onSubmit={(event) => event.stopPropagation()}>
              <ActionButton
                action={removeFineType}
                fields={{ id: fineType.id }}
                label="Slet fra kataloget"
                variant="danger"
                confirm={`Slet “${fineType.name}” fra kataloget?`}
                confirmLabel="Slet"
              />
            </div>
          </DialogForm>
        )}
      </Modal>
    </>
  );
}

function FineTypeFields({ finePriceKr, fineType }: { finePriceKr: number; fineType?: FineType }) {
  const [units, setUnits] = useState(fineType?.units ?? 1);
  return (
    <>
      <Field label="Navn" htmlFor="name">
        <Input id="name" name="name" defaultValue={fineType?.name} placeholder="Fx for sent til træning" maxLength={200} required />
      </Field>
      <Field label="Antal bøder" htmlFor="units" hint={`= ${kr((units || 0) * finePriceKr)} (1 bøde = ${kr(finePriceKr)})`}>
        <Input
          id="units"
          name="units"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={units}
          onChange={(e) => setUnits(Number(e.target.value))}
          required
        />
      </Field>
      <Field label="Beskrivelse (valgfri)" htmlFor="description">
        <Textarea id="description" name="description" rows={2} defaultValue={fineType?.description ?? ""} maxLength={2000} />
      </Field>
    </>
  );
}
