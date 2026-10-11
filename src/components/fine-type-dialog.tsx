"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Textarea } from "@/components/ui";
import { saveFineType } from "@/app/actions/fines";
import { kr } from "@/lib/money";

export function FineTypeDialog({
  finePriceKr,
  fineType,
}: {
  finePriceKr: number;
  fineType?: { id: string; name: string; description: string | null; units: number };
}) {
  const [units, setUnits] = useState(fineType?.units ?? 1);
  return (
    <FormDialog
      trigger={fineType ? "Ret" : "Ny bøde"}
      triggerVariant={fineType ? "ghost" : "primary"}
      title={fineType ? "Ret bøde" : "Ny bøde i kataloget"}
      action={saveFineType}
      submitLabel="Gem"
    >
      {fineType && <input type="hidden" name="id" value={fineType.id} />}
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
    </FormDialog>
  );
}
