"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { createChallenge } from "@/app/actions/fines";
import { fineUnits, kr } from "@/lib/money";

/**
 * Reporting a challenge that has been played. It goes through when somebody else on the
 * team approves it, and the stake moves from the winner's fines to the loser's.
 */
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
    <FormDialog trigger="Udfordring" title="Meld en udfordring" action={createChallenge} submitLabel="Send til godkendelse">
      <Field label="Hvem spillede du mod?" htmlFor="opponentId">
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
      <Field label="Hvem vandt?" htmlFor="outcome">
        <Select id="outcome" name="outcome" defaultValue="won" required>
          <option value="won">Jeg vandt</option>
          <option value="lost">Min modstander vandt</option>
        </Select>
      </Field>
      <Field label="Hvad gik udfordringen ud på?" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={2}
          maxLength={200}
          placeholder="Fx første til at ramme overliggeren"
          required
        />
      </Field>
      <Field
        label="Indsats (antal bøder)"
        htmlFor="units"
        hint={`Vinderen slipper for ${fineUnits(units || 0)} (${kr((units || 0) * finePriceKr)}), og taberen overtager dem.`}
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
