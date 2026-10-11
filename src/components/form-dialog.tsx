"use client";

import { useState } from "react";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { Button, type Variant } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import type { FormAction } from "@/lib/action-result";

/**
 * The form inside a sheet. Mounted only while open, so reopening never shows the last
 * attempt's error; closes only once the action reports success, so a refused submission
 * keeps everything typed and says why beside the button.
 */
export function DialogForm({
  action,
  submitLabel,
  onDone,
  onCancel,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  onDone: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const { state, pending, handleSubmit } = useFormAction(action, { onSuccess: onDone });
  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="space-y-4">{children}</ModalBody>
      <ModalFooter>
        {state?.ok === false && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {state.error}
          </p>
        )}
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 sm:flex-none">
            Annuller
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending} className="flex-1 sm:flex-none">
            {pending ? "Gemmer…" : submitLabel}
          </Button>
        </div>
      </ModalFooter>
    </form>
  );
}

/** A button that opens a sheet holding a form. */
export function FormDialog({
  trigger,
  triggerVariant = "primary",
  triggerClassName = "",
  title,
  action,
  submitLabel,
  size,
  children,
}: {
  trigger: React.ReactNode;
  triggerVariant?: Variant;
  triggerClassName?: string;
  title: string;
  action: FormAction;
  submitLabel: string;
  size?: "screen" | "drawer";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={triggerVariant} className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size={size}>
        {open && (
          <DialogForm action={action} submitLabel={submitLabel} onDone={() => setOpen(false)} onCancel={() => setOpen(false)}>
            {children}
          </DialogForm>
        )}
      </Modal>
    </>
  );
}
