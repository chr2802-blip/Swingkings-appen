"use client";

import { useState } from "react";
import type { ActivityKind } from "@prisma/client";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { TemplatePicker } from "@/components/template-picker";
import { saveActivity } from "@/app/actions/activities";
import type { ActivityOption, TemplateOption } from "@/lib/activity-data";

export type EditableActivity = {
  id: string;
  kind: ActivityKind;
  title: string;
  opponent: string | null;
  startsAtInput: string;
  location: string | null;
  isHome: boolean | null;
  note: string | null;
};

/**
 * An activity typed in by hand — a match, a training, or anything else (afslutningsfest).
 * One from KampKlar is edited in KampKlar. A new one can be given standard jobs and the
 * jobs of an earlier activity in the same go.
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
  const [kind, setKind] = useState<ActivityKind>(activity?.kind ?? "MATCH");
  return (
    <FormDialog
      trigger={activity ? "Ret aktivitet" : "Ny aktivitet"}
      triggerVariant={activity ? "secondary" : "primary"}
      title={activity ? "Ret aktivitet" : "Ny aktivitet"}
      action={saveActivity}
      submitLabel="Gem aktivitet"
    >
      {activity && <input type="hidden" name="id" value={activity.id} />}
      <Field label="Type" htmlFor="kind">
        <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
          <option value="MATCH">Kamp</option>
          <option value="TRAINING">Træning</option>
          <option value="OTHER">Anden aktivitet</option>
        </Select>
      </Field>
      {kind === "MATCH" ? (
        <>
          <Field label="Modstander" htmlFor="opponent">
            <Input id="opponent" name="opponent" defaultValue={activity?.opponent ?? ""} maxLength={200} required />
          </Field>
          <Field label="Hjemme eller ude" htmlFor="venue">
            <Select
              id="venue"
              name="venue"
              defaultValue={activity?.isHome === true ? "home" : activity?.isHome === false ? "away" : "unknown"}
            >
              <option value="home">Hjemme</option>
              <option value="away">Ude</option>
              <option value="unknown">Ved ikke</option>
            </Select>
          </Field>
        </>
      ) : (
        <Field label="Navn" htmlFor="title">
          <Input
            id="title"
            name="title"
            defaultValue={activity && activity.kind !== "MATCH" ? activity.title : ""}
            placeholder={kind === "TRAINING" ? "Træning" : "Fx afslutningsfest"}
            maxLength={200}
            required={kind === "OTHER"}
          />
        </Field>
      )}
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
