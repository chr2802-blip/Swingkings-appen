"use client";

import { Button, Field, Input } from "@/components/ui";
import { ShareLink, isJoinPath } from "@/components/share-link";
import { useFormAction } from "@/components/use-form-action";
import { createTeam } from "@/app/actions/teams";

export function CreateTeamForm() {
  const { state, pending, handleSubmit } = useFormAction(createTeam, { onSuccess: (form) => form.reset() });
  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Holdets navn" htmlFor="team-name">
        <Input id="team-name" name="name" required maxLength={200} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
        <input type="checkbox" name="adminLink" value="on" className="h-4 w-4 accent-[var(--accent)]" />
        Lav et link til holdets første person (ellers bliver du selv admin)
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Gemmer…" : "Opret hold"}
        </Button>
        {state?.ok === false && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && !isJoinPath(state.note) && <p className="text-sm text-emerald-700">{state.note}</p>}
      </div>
      {state?.ok && isJoinPath(state.note) && (
        <div className="space-y-2 sm:col-span-2">
          <ShareLink path={state.note} />
          <p className="text-xs text-slate-500">
            Når personen har oprettet sig, så åbn holdet her under Admin og gør dem til admin under Holdindstillinger.
          </p>
        </div>
      )}
    </form>
  );
}
