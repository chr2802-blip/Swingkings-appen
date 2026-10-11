"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { saveMatch } from "@/app/actions/matches";

export type EditableMatch = {
  id: string;
  opponent: string | null;
  startsAtInput: string;
  location: string | null;
  isHome: boolean | null;
  note: string | null;
};

/** A match typed in by hand. One from KampKlar is edited in KampKlar. */
export function MatchDialog({ match }: { match?: EditableMatch }) {
  return (
    <FormDialog
      trigger={match ? "Ret kamp" : "Ny kamp"}
      triggerVariant={match ? "secondary" : "primary"}
      title={match ? "Ret kamp" : "Ny kamp"}
      action={saveMatch}
      submitLabel="Gem kamp"
    >
      {match && <input type="hidden" name="id" value={match.id} />}
      <Field label="Modstander" htmlFor="opponent">
        <Input id="opponent" name="opponent" defaultValue={match?.opponent ?? ""} maxLength={200} required />
      </Field>
      <Field label="Kampstart" htmlFor="startsAt">
        <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={match?.startsAtInput} required />
      </Field>
      <Field label="Hjemme eller ude" htmlFor="venue">
        <Select
          id="venue"
          name="venue"
          defaultValue={match?.isHome === true ? "home" : match?.isHome === false ? "away" : "unknown"}
        >
          <option value="home">Hjemme</option>
          <option value="away">Ude</option>
          <option value="unknown">Ved ikke</option>
        </Select>
      </Field>
      <Field label="Sted (valgfri)" htmlFor="location">
        <Input id="location" name="location" defaultValue={match?.location ?? ""} maxLength={2000} />
      </Field>
      <Field label="Note (valgfri)" htmlFor="note">
        <Textarea id="note" name="note" rows={2} defaultValue={match?.note ?? ""} maxLength={2000} />
      </Field>
      {!match && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="addTemplates" defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
          Tilføj holdets standardopgaver og fordel dem
        </label>
      )}
    </FormDialog>
  );
}
