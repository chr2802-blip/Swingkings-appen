"use client";

import { useState } from "react";
import { Button, type Variant } from "@/components/ui";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { useFormAction } from "@/components/use-form-action";
import type { FormAction } from "@/lib/action-result";

/**
 * One press that calls an action with a few fixed fields — accept, mark done, delete.
 * With `confirm`, the press first asks in a drawer, for anything that cannot be undone.
 * A refusal is said beside the button rather than swallowed.
 */
export function ActionButton({
  action,
  fields,
  label,
  variant = "secondary",
  className = "",
  confirm,
  confirmLabel,
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: React.ReactNode;
  variant?: Variant;
  className?: string;
  /** The question asked before going ahead, e.g. "Slet bøden?". */
  confirm?: string;
  confirmLabel?: string;
}) {
  const [asking, setAsking] = useState(false);
  const { state, pending, handleSubmit } = useFormAction(action, { onSuccess: () => setAsking(false) });

  const hidden = Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);

  if (!confirm) {
    return (
      <form onSubmit={handleSubmit} className="inline-flex flex-col items-start gap-1">
        {hidden}
        <Button type="submit" variant={variant} disabled={pending} aria-busy={pending} className={className}>
          {label}
        </Button>
        {state?.ok === false && (
          <span role="alert" className="text-xs text-red-600">
            {state.error}
          </span>
        )}
      </form>
    );
  }

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setAsking(true)}>
        {label}
      </Button>
      <Modal open={asking} onClose={() => setAsking(false)} title={confirm} size="drawer">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {hidden}
          <ModalBody>
            <p className="text-sm text-slate-600">Det kan ikke fortrydes.</p>
          </ModalBody>
          <ModalFooter>
            {state?.ok === false && (
              <p role="alert" className="mb-3 text-sm text-red-600">
                {state.error}
              </p>
            )}
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setAsking(false)} className="flex-1 sm:flex-none">
                Annuller
              </Button>
              <Button type="submit" variant="danger" disabled={pending} className="flex-1 sm:flex-none">
                {confirmLabel ?? "Ja, fortsæt"}
              </Button>
            </div>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
