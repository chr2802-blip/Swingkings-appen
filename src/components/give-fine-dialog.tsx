"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Textarea } from "@/components/ui";
import { Select } from "@/components/select";
import { PlayerSelect } from "@/components/player-select";
import { giveFine } from "@/app/actions/fines";
import { fineUnits, kr } from "@/lib/money";
import { Star } from "@/components/crest";
import { useShowFresh } from "@/components/fresh";

type FineTypeOption = { id: string; name: string; units: number };
type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

/**
 * Giving a fine: who (one or several, from the drop-down) and what for — always a fine
 * from the catalogue, at the number of fines the catalogue says. Nothing is written
 * freely and no price is chosen here: the catalogue is the treasurer's.
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
  const chosen = fineTypes.find((type) => type.id === typeId);
  const show = useShowFresh();

  return (
    <FormDialog trigger={triggerLabel} triggerIcon={<Star className="h-5 w-5" />} title="Giv bøde" action={giveFine}
      submitLabel="Giv bøde"
      // Given, the fines are shown where they are listed: the history slides in, and they pulse.
      onDone={(result) => void show(result, "history")}
    >
      <Field label="Hvem?" htmlFor="playerId">
        <PlayerSelect id="playerId" name="playerId" members={members} defaultSelected={defaultPlayerId ? [defaultPlayerId] : []} />
      </Field>
      {fineTypes.length > 0 ? (
        <Field
          label="Bøde fra kataloget"
          htmlFor="fineTypeId"
          hint={chosen ? `${fineUnits(chosen.units)} á ${kr(finePriceKr)} — i alt ${kr(chosen.units * finePriceKr)} pr. spiller.` : undefined}
        >
          <Select id="fineTypeId" name="fineTypeId" value={typeId} onValueChange={setTypeId} required>
            <option value="" disabled>
              Vælg bøde…
            </option>
            {fineTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({fineUnits(type.units)})
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          Kataloget er tomt. Bødekasseformanden lægger bøderne i kataloget under Bøder → Katalog.
        </p>
      )}
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
