"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Input } from "@/components/ui";
import { startNewSeason } from "@/app/actions/season";
import { MAX_SEASON_NAME } from "@/lib/season";

/** The last step of the season guide: name the season that ends, and say you mean it. */
export function StartSeasonDialog({ defaultName }: { defaultName: string }) {
  return (
    <FormDialog trigger="Start ny sæson" title="Start ny sæson" action={startNewSeason} submitLabel="Start ny sæson" size="drawer">
      <Field label="Navn på sæsonen der slutter" htmlFor="season-name" hint="Står over resuméet under Tidligere sæsoner.">
        <Input id="season-name" name="name" required maxLength={MAX_SEASON_NAME} defaultValue={defaultName} />
      </Field>
      <p className="text-sm text-slate-600">
        Alle bøder og udfordringer slettes — også dem, der ikke er nulstillet. Afsluttede aktiviteter og deres opgaver,
        invitationslinks og kontingent-markeringer forsvinder også. Kommende aktiviteter, spillere og opslag bliver.
      </p>
      <label className="flex items-start gap-2 text-sm font-medium">
        <input type="checkbox" name="confirm" value="on" required className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        Jeg forstår, at det ikke kan fortrydes
      </label>
    </FormDialog>
  );
}
