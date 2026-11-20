"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { FINE_HISTORY_HREF, useShowFresh } from "@/components/fresh";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { createChallenge } from "@/app/actions/fines";
import { fineUnits, kr } from "@/lib/money";

/**
 * Reporting a challenge that has been played. It goes through when somebody else on the
 * team (or an admin) approves it, and the stake moves from the winner's fines to the loser's. It names
 * no match: a challenge is between two people, wherever it was played.
 */
export function ChallengeDialog({
  opponents,
  finePriceKr,
  defaultOpponentId,
  triggerClassName,
  showIn = FINE_HISTORY_HREF,
}: {
  opponents: { userId: string; name: string }[];
  finePriceKr: number;
  /** Somebody chosen from the start: the person whose page the "+" is on. */
  defaultOpponentId?: string;
  triggerClassName?: string;
  /** Where it then stands, pulsing: the fine box's history, or the player's own fines tab. */
  showIn?: string;
}) {
  const [units, setUnits] = useState(1);
  const show = useShowFresh();
  return (
    <FormDialog
      trigger="Meld udfordring"
      triggerIcon="⚔️"
      triggerClassName={triggerClassName}
      title="Meld en udfordring"
      action={createChallenge}
      submitLabel="Send til godkendelse"
      // Reported, it waits in the history among the fines, pulsing there as a fine given does.
      onDone={(result) => void show(result, showIn, { reported: true })}
    >
      <Field label="Hvem spillede du mod?" htmlFor="opponentId">
        <Select id="opponentId" name="opponentId" defaultValue={defaultOpponentId ?? ""} required>
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
    </FormDialog>
  );
}
