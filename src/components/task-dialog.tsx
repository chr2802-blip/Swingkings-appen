"use client";

import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { PlayerChecklist } from "@/components/player-checklist";
import { createTask } from "@/app/actions/tasks";

type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

/**
 * A new job: tied to a match (deadline defaults to kick-off) or standing alone with a
 * deadline. Handed to the people ticked, fairly by the app, or left open to be taken.
 */
export function TaskDialog({
  members,
  matches,
  defaultMatchId,
  triggerLabel = "Ny opgave",
}: {
  members: Member[];
  matches: { id: string; label: string }[];
  defaultMatchId?: string;
  triggerLabel?: string;
}) {
  const [matchId, setMatchId] = useState(defaultMatchId ?? "");
  const [assign, setAssign] = useState<"auto" | "pick" | "none">("auto");
  return (
    <FormDialog trigger={triggerLabel} title="Ny opgave" action={createTask} submitLabel="Opret opgave">
      <Field label="Opgave" htmlFor="title">
        <Input id="title" name="title" placeholder="Fx vask spilletøj" maxLength={200} required />
      </Field>
      <Field label="Kamp" htmlFor="matchId">
        <Select id="matchId" name="matchId" value={matchId} onChange={(e) => setMatchId(e.target.value)}>
          <option value="">Ingen kamp — opgaven har sin egen frist</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={matchId ? "Frist (valgfri)" : "Frist"}
        htmlFor="dueOn"
        hint={matchId ? "Uden frist er fristen kampstart." : undefined}
      >
        <Input id="dueOn" name="dueOn" type="date" required={!matchId} />
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
