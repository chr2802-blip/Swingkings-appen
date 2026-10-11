"use client";

import type { TeamTheme } from "@prisma/client";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { PhotoField } from "@/components/photo-field";
import { updateTeam } from "@/app/actions/teams";
import { THEMES } from "@/lib/theme";

export function TeamSettingsForm({
  team,
}: {
  team: { name: string; theme: TeamTheme; finePriceKr: number; calendarUrl: string | null; photoId: string | null };
}) {
  return (
    <ActionForm action={updateTeam} submitLabel="Gem" className="space-y-5">
      <Field label="Holdets navn" htmlFor="name" hint="Bruges også til at kende jeres side i KampKlar-kampe (“Hjemme - Ude”).">
        <Input id="name" name="name" defaultValue={team.name} maxLength={200} required />
      </Field>
      <PhotoField label="Holdets logo/billede" defaultPhotoId={team.photoId} aspect="aspect-square max-w-40" />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-slate-700">Farve</legend>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((theme) => (
            <label
              key={theme.value}
              data-theme={theme.value}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm has-[:checked]:ring-2 has-[:checked]:ring-[var(--accent)]"
            >
              <input type="radio" name="theme" value={theme.value} defaultChecked={team.theme === theme.value} className="sr-only" />
              <span className="h-4 w-4 rounded-full bg-[var(--accent)]" />
              {theme.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Pris for én bøde (kr)" htmlFor="finePriceKr" hint="Gælder nye bøder. Allerede givne bøder beholder deres pris.">
        <Input id="finePriceKr" name="finePriceKr" type="number" inputMode="numeric" min={1} max={1000} defaultValue={team.finePriceKr} required />
      </Field>
      <Field
        label="Kalenderlink fra DBU KampKlar"
        htmlFor="calendarUrl"
        hint="I Fodbold-appen eller på Mit DBU: gå til holdet i KampKlar → Kalender → “Eksporter kalender”, og kopiér linket hertil. Kampene hentes hver morgen og når du trykker “Hent fra KampKlar”."
      >
        <Input
          id="calendarUrl"
          name="calendarUrl"
          type="url"
          inputMode="url"
          placeholder="webcal://… eller https://…"
          defaultValue={team.calendarUrl ?? ""}
        />
      </Field>
    </ActionForm>
  );
}
