"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Select } from "@/components/ui";
import { TemplatePicker } from "@/components/template-picker";
import { addStandardTasks, copyTasks } from "@/app/actions/activities";
import type { ActivityOption, TemplateOption } from "@/lib/activity-data";

/** Picks some of the team's standard jobs for one activity. */
export function StandardTasksDialog({ activityId, templates }: { activityId: string; templates: TemplateOption[] }) {
  return (
    <FormDialog
      trigger="Tilføj standardopgaver"
      triggerVariant="secondary"
      title="Tilføj standardopgaver"
      action={addStandardTasks}
      submitLabel="Tilføj og fordel"
    >
      <input type="hidden" name="activityId" value={activityId} />
      <Field label="Vælg opgaver" hint="De fordeles retfærdigt — dem med færrest opgaver det seneste år først.">
        <TemplatePicker templates={templates} />
      </Field>
    </FormDialog>
  );
}

/** Copies every job from an earlier activity onto this one. */
export function CopyTasksDialog({ activityId, copyable }: { activityId: string; copyable: ActivityOption[] }) {
  return (
    <FormDialog
      trigger="Kopiér opgaver"
      triggerVariant="secondary"
      title="Kopiér opgaver fra en tidligere aktivitet"
      action={copyTasks}
      submitLabel="Kopiér og fordel"
    >
      <input type="hidden" name="activityId" value={activityId} />
      <Field
        label="Fra"
        htmlFor="copyFromId"
        hint="Opgaverne kopieres med samme antal personer og frist i forhold til starttidspunktet, og fordeles på ny."
      >
        <Select id="copyFromId" name="copyFromId" required defaultValue="">
          <option value="" disabled>
            Vælg aktivitet
          </option>
          {copyable.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </FormDialog>
  );
}
