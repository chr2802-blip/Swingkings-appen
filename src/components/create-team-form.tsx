"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { createTeam } from "@/app/actions/teams";

export function CreateTeamForm() {
  return (
    <ActionForm action={createTeam} submitLabel="Opret hold" resetOnSuccess className="grid gap-4 sm:grid-cols-2">
      <Field label="Holdets navn" htmlFor="team-name">
        <Input id="team-name" name="name" required maxLength={200} />
      </Field>
      <Field label="Trænerens e-mail (valgfri)" htmlFor="admin-email" hint="Tom: du bliver selv træner på holdet.">
        <Input id="admin-email" name="adminEmail" type="email" />
      </Field>
    </ActionForm>
  );
}
