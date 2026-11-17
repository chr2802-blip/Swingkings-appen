"use client";

import { setSignup } from "@/app/actions/activities";
import { useFormAction } from "@/components/use-form-action";

/**
 * "Jeg kommer" / "Jeg kommer ikke" as one segmented choice: two halves of equal size,
 * the chosen one filled — green for yes, red for no — and marked `aria-pressed`.
 */
export function SignupChoice({ activityId, mine }: { activityId: string; mine: boolean | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
      <Choice activityId={activityId} going="yes" chosen={mine === true} label="Jeg kommer" icon="✓" />
      <Choice activityId={activityId} going="no" chosen={mine === false} label="Jeg kommer ikke" icon="✕" />
    </div>
  );
}

function Choice({
  activityId,
  going,
  chosen,
  label,
  icon,
}: {
  activityId: string;
  going: "yes" | "no";
  chosen: boolean;
  label: string;
  icon: string;
}) {
  const { state, pending, handleSubmit } = useFormAction(setSignup);
  const look = chosen
    ? going === "yes"
      ? "bg-emerald-600 text-white shadow-sm"
      : "bg-white text-red-600 shadow-sm ring-1 ring-red-200"
    : "text-slate-600 hover:bg-white/70";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="going" value={going} />
      <button
        type="submit"
        aria-pressed={chosen}
        disabled={pending}
        aria-busy={pending}
        className={`press-button flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold disabled:opacity-60 ${look}`}
      >
        <span aria-hidden="true" className={chosen ? "" : "text-slate-400"}>
          {icon}
        </span>
        {label}
      </button>
      {state?.ok === false && (
        <span role="alert" className="mt-1 px-1 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
