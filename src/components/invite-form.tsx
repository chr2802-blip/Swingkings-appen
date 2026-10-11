"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { createInvite } from "@/app/actions/teams";

export function InviteForm() {
  return (
    <ActionForm action={createInvite} submitLabel="Lav invitation" resetOnSuccess className="grid gap-4 sm:grid-cols-2">
      <Field label="E-mail" htmlFor="invite-email">
        <Input id="invite-email" name="email" type="email" required />
      </Field>
      <Field label="Rolle" htmlFor="invite-role">
        <Select id="invite-role" name="role" defaultValue="PLAYER">
          <option value="PLAYER">Spiller</option>
          <option value="TREASURER">Kasserer</option>
          <option value="ADMIN">Træner/holdleder</option>
        </Select>
      </Field>
    </ActionForm>
  );
}
