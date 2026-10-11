"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Textarea } from "@/components/ui";
import { PlayerChecklist } from "@/components/player-checklist";
import { updateTask } from "@/app/actions/tasks";

export function EditTaskDialog({
  task,
  members,
}: {
  task: { id: string; title: string; description: string | null; dueOn: string; hasMatch: boolean; assigneeIds: string[] };
  members: { userId: string; name: string; photoId: string | null; shirtNumber: number | null }[];
}) {
  return (
    <FormDialog trigger="Ret" triggerVariant="secondary" title="Ret opgave" action={updateTask} submitLabel="Gem">
      <input type="hidden" name="id" value={task.id} />
      <Field label="Opgave" htmlFor="title">
        <Input id="title" name="title" defaultValue={task.title} maxLength={200} required />
      </Field>
      <Field label="Frist" htmlFor="dueOn" hint={task.hasMatch ? "Uden frist er fristen kampstart." : undefined}>
        <Input id="dueOn" name="dueOn" type="date" defaultValue={task.dueOn} required={!task.hasMatch} />
      </Field>
      <Field label="Hvem?">
        <PlayerChecklist members={members} name="assigneeId" defaultChecked={task.assigneeIds} />
      </Field>
      <Field label="Beskrivelse" htmlFor="description">
        <Textarea id="description" name="description" rows={3} defaultValue={task.description ?? ""} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}
