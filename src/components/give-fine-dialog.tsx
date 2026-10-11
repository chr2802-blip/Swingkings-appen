"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { PlayerChecklist } from "@/components/player-checklist";
import { giveFine } from "@/app/actions/fines";
import { fineUnits, kr } from "@/lib/money";

type FineTypeOption = { id: string; name: string; units: number };
type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

/**
 * Giving a fine: who (one or several), what for (from the catalogue, or written freely),
 * and how many fines. Picking from the catalogue fills in its price, which can still be
 * changed for this one time.
 */
export function GiveFineDialog({
  members,
  fineTypes,
  finePriceKr,
  matches = [],
  defaultPlayerId,
  defaultMatchId,
  triggerLabel = "Giv bøde",
}: {
  members: Member[];
  fineTypes: FineTypeOption[];
  finePriceKr: number;
  matches?: { id: string; label: string }[];
  defaultPlayerId?: string;
  defaultMatchId?: string;
  triggerLabel?: string;
}) {
  const [typeId, setTypeId] = useState("");
  const [units, setUnits] = useState("");
  const chosen = fineTypes.find((type) => type.id === typeId);
  const effective = units ? Number(units) : (chosen?.units ?? 0);

  return (
    <FormDialog trigger={triggerLabel} title="Giv bøde" action={giveFine} submitLabel="Giv bøde">
      <Field label="Hvem?">
        <PlayerChecklist members={members} name="playerId" defaultChecked={defaultPlayerId ? [defaultPlayerId] : []} />
      </Field>
      <Field label="Bøde fra kataloget" htmlFor="fineTypeId">
        <Select id="fineTypeId" name="fineTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Skriv selv…</option>
          {fineTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} ({fineUnits(type.units)})
            </option>
          ))}
        </Select>
      </Field>
      {!chosen && (
        <Field label="Hvad er bøden for?" htmlFor="reason">
          <Input id="reason" name="reason" placeholder="Fx glemte benskinner" maxLength={200} />
        </Field>
      )}
      <Field
        label="Antal bøder"
        htmlFor="units"
        hint={`1 bøde = ${kr(finePriceKr)}.${effective > 0 ? ` I alt ${kr(effective * finePriceKr)} pr. spiller.` : ""}`}
      >
        <Input
          id="units"
          name="units"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          placeholder={chosen ? String(chosen.units) : "1"}
          value={units}
          onChange={(e) => setUnits(e.target.value)}
        />
      </Field>
      {matches.length > 0 && (
        <Field label="Kamp (valgfri)" htmlFor="matchId">
          <Select id="matchId" name="matchId" defaultValue={defaultMatchId ?? ""}>
            <option value="">Ingen kamp</option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Note (valgfri)" htmlFor="note">
        <Textarea id="note" name="note" rows={2} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}
