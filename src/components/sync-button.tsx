"use client";

import { useFormAction } from "@/components/use-form-action";
import { Button } from "@/components/ui";
import { syncCalendar } from "@/app/actions/matches";

/** "Hent fra KampKlar" — reads the feed now rather than waiting for the morning job. */
export function SyncButton() {
  const { state, pending, handleSubmit } = useFormAction(syncCalendar);
  return (
    <form onSubmit={handleSubmit} className="relative">
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        {pending ? "Henter…" : "Hent fra KampKlar"}
      </Button>
      {state && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`absolute top-full right-0 z-10 mt-2 w-64 rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200 ${
            state.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.ok ? state.note : state.error}
        </p>
      )}
    </form>
  );
}
