"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Textarea } from "@/components/ui";
import { MultiSelect, Select } from "@/components/select";
import { PlayerSelect } from "@/components/player-select";
import { giveFine } from "@/app/actions/fines";
import { fineUnits, kr } from "@/lib/money";
import { Star } from "@/components/crest";
import { FINE_HISTORY_HREF, useShowFresh } from "@/components/fresh";

type FineTypeOption = { id: string; name: string; units: number };
type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

/**
 * Giving a fine: who (one or several, from the drop-down) and what for — always a fine
 * from the catalogue, at the number of fines the catalogue says. Nothing is written
 * freely and no price is chosen here: the catalogue is the treasurer's. With
 * `severalFines` (a player's page) more than one fine from the catalogue is given at once.
 */
export function GiveFineDialog({
  members,
  fineTypes,
  finePriceKr,
  matches = [],
  defaultPlayerId,
  defaultMatchId,
  triggerLabel = "Giv bøde",
  severalFines = false,
  showIn = FINE_HISTORY_HREF,
}: {
  members: Member[];
  fineTypes: FineTypeOption[];
  finePriceKr: number;
  matches?: { id: string; label: string }[];
  defaultPlayerId?: string;
  defaultMatchId?: string;
  triggerLabel?: string;
  /** Several fines from the catalogue in one go, to the same player(s). */
  severalFines?: boolean;
  /**
   * The swipe page where the new fines are listed and pulse: the fine box's history, or
   * the page's own fines tab (an activity's, a player's) so giving one does not leave it.
   */
  showIn?: string;
}) {
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const chosen = fineTypes.filter((type) => typeIds.includes(type.id));
  const units = chosen.reduce((sum, type) => sum + type.units, 0);
  const show = useShowFresh();

  return (
    <FormDialog trigger={triggerLabel} triggerIcon={<Star className="h-5 w-5" />} title="Giv bøde" action={giveFine}
      submitLabel="Giv bøde"
      // Given, the fines are shown where they are listed: that page slides in, and they pulse.
      onDone={(result) => void show(result, showIn)}
    >
      <Field label="Hvem?" htmlFor="playerId">
        <PlayerSelect id="playerId" name="playerId" members={members} defaultSelected={defaultPlayerId ? [defaultPlayerId] : []} />
      </Field>
      {fineTypes.length > 0 ? (
        <Field
          label={severalFines ? "Bøder fra kataloget" : "Bøde fra kataloget"}
          htmlFor="fineTypeId"
          hint={units > 0 ? `${fineUnits(units)} á ${kr(finePriceKr)} — i alt ${kr(units * finePriceKr)} pr. spiller.` : undefined}
        >
          {severalFines ? (
            <MultiSelect
              id="fineTypeId"
              name="fineTypeId"
              placeholder="Vælg bøder…"
              onValuesChange={setTypeIds}
              choices={fineTypes.map((type) => ({ value: type.id, label: `${type.name} (${fineUnits(type.units)})` }))}
            />
          ) : (
            <Select id="fineTypeId" name="fineTypeId" value={typeIds[0] ?? ""} onValueChange={(id) => setTypeIds([id])} required>
              <option value="" disabled>
                Vælg bøde…
              </option>
              {fineTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({fineUnits(type.units)})
                </option>
              ))}
            </Select>
          )}
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
