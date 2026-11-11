"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { PlayerChecklist } from "@/components/player-checklist";
import { createTask } from "@/app/actions/tasks";

type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

/**
 * A new job on one activity (deadline defaults to its start). Handed to the people
 * ticked, fairly by the app, or left open to be taken.
 */
export function TaskDialog({
  members,
  activityId,
  triggerLabel = "Ny opgave",
}: {
  members: Member[];
  activityId: string;
  triggerLabel?: string;
}) {
  const [assign, setAssign] = useState<"auto" | "pick" | "none">("auto");
  return (
    <FormDialog trigger={triggerLabel} title="Ny opgave" action={createTask} submitLabel="Opret opgave">
      <input type="hidden" name="matchId" value={activityId} />
      <Field label="Opgave" htmlFor="title">
        <Input id="title" name="title" placeholder="Fx trøjevask" maxLength={200} required />
      </Field>
      <Field label="Frist (valgfri)" htmlFor="dueOn" hint="Uden frist er fristen aktivitetens start.">
        <Input id="dueOn" name="dueOn" type="date" />
      </Field>
      <Field label="Hvem skal gøre det?" htmlFor="assign">
        <Select id="assign" name="assign" value={assign} onChange={(e) => setAssign(e.target.value as typeof assign)}>
          <option value="auto">Fordel retfærdigt (dem med færrest opgaver)</option>
          <option value="pick">Jeg vælger selv</option>
          <option value="none">Ingen endnu — nogen tager den</option>
        </Select>
      </Field>
      {assign === "auto" && (
        <Field label="Antal personer" htmlFor="people">
          <Input id="people" name="people" type="number" inputMode="numeric" min={1} max={20} defaultValue={1} />
        </Field>
      )}
      {assign === "pick" && <PlayerChecklist members={members} name="assigneeId" />}
      <Field label="Beskrivelse (valgfri)" htmlFor="description">
        <Textarea id="description" name="description" rows={3} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}
