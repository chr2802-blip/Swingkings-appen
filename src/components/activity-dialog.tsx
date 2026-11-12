"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { TemplatePicker } from "@/components/template-picker";
import { saveActivity } from "@/app/actions/activities";
import type { ActivityOption, TemplateOption } from "@/lib/activity-data";

export type EditableActivity = {
  id: string;
  title: string;
  startsAtInput: string;
  location: string | null;
  note: string | null;
};

/**
 * An activity typed in by hand — the afslutningsfest, a holdtur — that teammates sign up
 * for. Matches and trainings come from KampKlar and are not made here. A new one can be
 * given standard jobs and the jobs of an earlier activity in the same go.
 */
export function ActivityDialog({
  activity,
  templates = [],
  copyable = [],
}: {
  activity?: EditableActivity;
  templates?: TemplateOption[];
  copyable?: ActivityOption[];
}) {
  return (
    <FormDialog
      trigger={activity ? "Ret aktivitet" : "Ny aktivitet"}
      triggerVariant={activity ? "secondary" : "primary"}
      title={activity ? "Ret aktivitet" : "Ny aktivitet"}
      action={saveActivity}
      submitLabel="Gem aktivitet"
    >
      {activity && <input type="hidden" name="id" value={activity.id} />}
      <Field label="Navn" htmlFor="title">
        <Input
          id="title"
          name="title"
          defaultValue={activity?.title ?? ""}
          placeholder="Fx afslutningsfest"
          maxLength={200}
          required
        />
      </Field>
      <Field label="Starter" htmlFor="startsAt">
        <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={activity?.startsAtInput} required />
      </Field>
      <Field label="Sted (valgfri)" htmlFor="location">
        <Input id="location" name="location" defaultValue={activity?.location ?? ""} maxLength={2000} />
      </Field>
      <Field label="Note (valgfri)" htmlFor="note">
        <Textarea id="note" name="note" rows={2} defaultValue={activity?.note ?? ""} maxLength={2000} />
      </Field>
      {!activity && templates.length === 0 && (
        <p className="text-xs text-slate-500">Holdet har ingen standardopgaver endnu. De oprettes under Holdindstillinger.</p>
      )}
      {!activity && templates.length > 0 && (
        <Field label="Standardopgaver" hint="De valgte opgaver fordeles retfærdigt — dem med færrest opgaver først.">
          <TemplatePicker templates={templates} />
        </Field>
      )}
      {!activity && copyable.length > 0 && (
        <Field label="Kopiér opgaver fra (valgfri)" htmlFor="copyFromId" hint="Opgaverne kopieres og fordeles på ny.">
          <Select id="copyFromId" name="copyFromId" defaultValue="">
            <option value="">Ingen</option>
            {copyable.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </FormDialog>
  );
}
