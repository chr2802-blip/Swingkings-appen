"use client";

import { Button, Field, Input } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { startNewSeason } from "@/app/actions/season";
import { MAX_SEASON_NAME } from "@/lib/season";

/** The last step of the season flow: name the season that ends, say you mean it, start. */
export function StartSeasonForm({ defaultName }: { defaultName: string }) {
  const { state, pending, handleSubmit } = useFormAction(startNewSeason);
  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-t border-slate-100 pt-4">
      <Field label="Navn på sæsonen der slutter" htmlFor="season-name" hint="Står over resuméet under Tidligere sæsoner.">
        <Input id="season-name" name="name" required maxLength={MAX_SEASON_NAME} defaultValue={defaultName} />
      </Field>
      <label className="flex items-start gap-2 font-medium">
        <input type="checkbox" name="confirm" value="on" required className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        Jeg forstår, at det ikke kan fortrydes
      </label>
      {state?.ok === false && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="danger" disabled={pending} aria-busy={pending} className="w-full">
        {pending ? "Starter…" : "Start ny sæson"}
      </Button>
    </form>
  );
}
