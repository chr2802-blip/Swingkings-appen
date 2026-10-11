"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Textarea } from "@/components/ui";
import { saveTaskTemplate } from "@/app/actions/matches";

export function TemplateDialog({
  template,
}: {
  template?: { id: string; title: string; description: string | null; people: number };
}) {
  return (
    <FormDialog
      trigger={template ? "Ret" : "Ny standardopgave"}
      triggerVariant={template ? "ghost" : "primary"}
      title={template ? "Ret standardopgave" : "Ny standardopgave"}
      action={saveTaskTemplate}
      submitLabel="Gem"
    >
      {template && <input type="hidden" name="id" value={template.id} />}
      <Field label="Opgave" htmlFor="title">
        <Input id="title" name="title" defaultValue={template?.title} placeholder="Fx vask spilletøj" maxLength={200} required />
      </Field>
      <Field label="Antal personer" htmlFor="people">
        <Input id="people" name="people" type="number" inputMode="numeric" min={1} max={20} defaultValue={template?.people ?? 1} required />
      </Field>
      <Field label="Beskrivelse (valgfri)" htmlFor="description">
        <Textarea id="description" name="description" rows={2} defaultValue={template?.description ?? ""} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}
