"use client";

import { Button } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import type { FormAction } from "@/lib/action-result";

/** A plain (non-dialog) form that says whether it worked. */
export function ActionForm({
  action,
  submitLabel,
  successLabel = "Gemt.",
  resetOnSuccess = false,
  className = "",
  children,
}: {
  action: FormAction;
  submitLabel: string;
  successLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { state, pending, handleSubmit } = useFormAction(action, {
    onSuccess: resetOnSuccess ? (form) => form.reset() : undefined,
  });
  return (
    <form onSubmit={handleSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Gemmer…" : submitLabel}
        </Button>
        {state?.ok === false && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && <p className="text-sm text-emerald-700">{state.note ?? successLabel}</p>}
      </div>
    </form>
  );
}
