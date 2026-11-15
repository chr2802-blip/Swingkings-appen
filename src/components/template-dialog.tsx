"use client";

import { FormDialog } from "@/components/form-dialog";
import type { Venue } from "@prisma/client";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { saveTaskTemplate } from "@/app/actions/activities";

export function TemplateDialog({
  template,
}: {
  template?: { id: string; title: string; description: string | null; people: number; autoAdd: boolean; autoVenue: Venue };
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
        <Input id="title" name="title" defaultValue={template?.title} placeholder="Fx trøjevask eller opkridtning" maxLength={200} required />
      </Field>
      <Field label="Antal personer" htmlFor="people">
        <Input id="people" name="people" type="number" inputMode="numeric" min={1} max={20} defaultValue={template?.people ?? 1} required />
      </Field>
      <Field label="Beskrivelse (valgfri)" htmlFor="description">
        <Textarea id="description" name="description" rows={2} defaultValue={template?.description ?? ""} maxLength={2000} />
      </Field>
      <Field
        label="Tilføj automatisk til nye kampe fra KampKlar"
        htmlFor="auto"
        hint="Kan KampKlar ikke se, om det er hjemme eller ude, kommer den med. Den kan altid vælges på aktivitetens side."
      >
        <Select
          id="auto"
          name="auto"
          defaultValue={template ? (template.autoAdd ? template.autoVenue : "OFF") : "ALL"}
        >
          <option value="ALL">Alle kampe – hjemme og ude</option>
          <option value="HOME">Kun hjemmekampe</option>
          <option value="AWAY">Kun udekampe</option>
          <option value="OFF">Nej – vælges, når en aktivitet oprettes</option>
        </Select>
      </Field>
    </FormDialog>
  );
}
