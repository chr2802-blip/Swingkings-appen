"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { MenuTrigger } from "@/components/action-menu";
import { DialogForm } from "@/components/form-dialog";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { PlayerChecklist } from "@/components/player-checklist";
import { TemplatePicker } from "@/components/template-picker";
import { createTask } from "@/app/actions/tasks";
import { addStandardTasks, copyTasks } from "@/app/actions/activities";
import type { ActivityOption, TemplateOption } from "@/lib/activity-data";
import type { FormAction } from "@/lib/action-result";

type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };
type Way = "new" | "standard" | "copy";

const WAYS: Record<Way, { label: string; action: FormAction; submitLabel: string }> = {
  new: { label: "Ny", action: createTask, submitLabel: "Opret opgave" },
  standard: { label: "Standardopgaver", action: addStandardTasks, submitLabel: "Tilføj og fordel" },
  copy: { label: "Kopiér", action: copyTasks, submitLabel: "Kopiér og fordel" },
};

/**
 * The one way to put jobs on an activity: a new job, some of the team's standard jobs,
 * or every job from an earlier activity. The last two are offered only when there is
 * something to pick from. Switching way starts that form afresh.
 *
 * Outside an activity (a person's page) there is no `activityId`: the new job's activity is
 * picked from `activities`, and only a new job is offered.
 */
export function TaskDialog({
  members,
  activityId,
  activities = [],
  defaultAssigneeId,
  templates = [],
  copyable = [],
  triggerLabel = "Ny opgave",
}: {
  members: Member[];
  activityId?: string;
  /** Without an `activityId`: the activities to choose between. */
  activities?: ActivityOption[];
  /** Somebody to tick from the start, with "Jeg vælger selv". */
  defaultAssigneeId?: string;
  templates?: TemplateOption[];
  copyable?: ActivityOption[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [way, setWay] = useState<Way>("new");
  const ways: Way[] = ["new"];
  if (activityId && templates.length > 0) ways.push("standard");
  if (activityId && copyable.length > 0) ways.push("copy");
  const current = WAYS[way];
  const close = () => setOpen(false);

  return (
    <>
      <MenuTrigger
        icon="📋"
        onClick={() => {
          setWay("new");
          setOpen(true);
        }}
      >
        {triggerLabel}
      </MenuTrigger>
      <Modal open={open} onClose={close} title="Ny opgave">
        {open && (
          <DialogForm key={way} action={current.action} submitLabel={current.submitLabel} onDone={close} onCancel={close}>
            {ways.length > 1 && (
              <div role="group" aria-label="Hvordan?" className="flex flex-wrap gap-2">
                {ways.map((w) => (
                  <Button
                    key={w}
                    type="button"
                    variant={w === way ? "primary" : "secondary"}
                    aria-pressed={w === way}
                    onClick={() => setWay(w)}
                  >
                    {WAYS[w].label}
                  </Button>
                ))}
              </div>
            )}
            {way === "new" && (
              <NewTaskFields
                members={members}
                activityId={activityId}
                activities={activities}
                defaultAssigneeId={defaultAssigneeId}
              />
            )}
            {way === "standard" && activityId && <StandardTaskFields activityId={activityId} templates={templates} />}
            {way === "copy" && activityId && <CopyTaskFields activityId={activityId} copyable={copyable} />}
          </DialogForm>
        )}
      </Modal>
    </>
  );
}

/** A new job (deadline defaults to the activity's start), handed out fairly, to those ticked, or left open. */
function NewTaskFields({
  members,
  activityId,
  activities,
  defaultAssigneeId,
}: {
  members: Member[];
  activityId?: string;
  activities: ActivityOption[];
  defaultAssigneeId?: string;
}) {
  const [assign, setAssign] = useState<"auto" | "pick" | "none">(defaultAssigneeId ? "pick" : "auto");
  return (
    <>
      {activityId ? (
        <input type="hidden" name="matchId" value={activityId} />
      ) : (
        <Field label="Aktivitet" htmlFor="matchId">
          <Select id="matchId" name="matchId" required defaultValue="">
            <option value="" disabled>
              Vælg aktivitet
            </option>
            {activities.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Opgave" htmlFor="title">
        <Input id="title" name="title" placeholder="Fx trøjevask" maxLength={200} required />
      </Field>
      <Field label="Frist (valgfri)" htmlFor="dueOn" hint="Uden frist er fristen aktivitetens start.">
        <Input id="dueOn" name="dueOn" type="date" />
      </Field>
      <Field label="Hvem skal gøre det?" htmlFor="assign">
        <Select id="assign" name="assign" value={assign} onValueChange={(v) => setAssign(v as typeof assign)}>
          <option value="auto">Fordel retfærdigt (dem med færrest opgaver)</option>
          <option value="pick">Jeg vælger selv</option>
          <option value="none">Ingen endnu — fordeles senere</option>
        </Select>
      </Field>
      {assign === "auto" && (
        <Field label="Antal personer" htmlFor="people">
          <Input id="people" name="people" type="number" inputMode="numeric" min={1} max={20} defaultValue={1} />
        </Field>
      )}
      {assign === "pick" && (
        <PlayerChecklist members={members} name="assigneeId" defaultChecked={defaultAssigneeId ? [defaultAssigneeId] : []} />
      )}
      <Field label="Beskrivelse (valgfri)" htmlFor="description">
        <Textarea id="description" name="description" rows={3} maxLength={2000} />
      </Field>
    </>
  );
}

/** Some of the team's standard jobs, distributed fairly. */
function StandardTaskFields({ activityId, templates }: { activityId: string; templates: TemplateOption[] }) {
  return (
    <>
      <input type="hidden" name="activityId" value={activityId} />
      <Field label="Vælg opgaver" hint="De fordeles retfærdigt — dem med færrest opgaver det seneste år først.">
        <TemplatePicker templates={templates} />
      </Field>
    </>
  );
}

/** Every job from an earlier activity, distributed afresh. */
function CopyTaskFields({ activityId, copyable }: { activityId: string; copyable: ActivityOption[] }) {
  return (
    <>
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
    </>
  );
}
