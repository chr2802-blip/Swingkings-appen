"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { createChallenge } from "@/app/actions/fines";
import { fineUnits, kr } from "@/lib/money";

export function ChallengeDialog({
  opponents,
  finePriceKr,
  matches,
  defaultMatchId,
}: {
  opponents: { userId: string; name: string }[];
  finePriceKr: number;
  matches: { id: string; label: string }[];
  defaultMatchId?: string;
}) {
  const [units, setUnits] = useState(1);
  return (
    <FormDialog trigger="Udfordr" title="Ny udfordring" action={createChallenge} submitLabel="Send udfordring">
      <Field label="Hvem udfordrer du?" htmlFor="opponentId">
        <Select id="opponentId" name="opponentId" defaultValue="" required>
          <option value="" disabled>
            Vælg spiller…
          </option>
          {opponents.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Hvad går udfordringen ud på?" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={2}
          maxLength={200}
          placeholder="Fx jeg scorer før dig på lørdag"
          required
        />
      </Field>
      <Field
        label="Indsats (antal bøder)"
        htmlFor="units"
        hint={`Taberen får ${fineUnits(units || 0)} = ${kr((units || 0) * finePriceKr)}.`}
      >
        <Input
          id="units"
          name="units"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={units}
          onChange={(e) => setUnits(Number(e.target.value))}
          required
        />
      </Field>
      {matches.length > 0 && (
        <Field label="Kamp (valgfri)" htmlFor="matchId">
          <Select id="matchId" name="matchId" defaultValue={defaultMatchId ?? ""}>
            <option value="">Ingen kamp</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </FormDialog>
  );
}
