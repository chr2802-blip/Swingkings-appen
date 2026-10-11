"use client";

import type { MemberRole } from "@prisma/client";
import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select } from "@/components/ui";
import { updateMember } from "@/app/actions/teams";

export function MemberDialog({
  member,
}: {
  member: { userId: string; name: string; role: MemberRole; shirtNumber: number | null; takesTasks: boolean };
}) {
  return (
    <FormDialog trigger="Ret" triggerVariant="ghost" title={member.name} action={updateMember} submitLabel="Gem" size="drawer">
      <input type="hidden" name="userId" value={member.userId} />
      <Field label="Rolle" htmlFor="role">
        <Select id="role" name="role" defaultValue={member.role}>
          <option value="PLAYER">Spiller</option>
          <option value="TREASURER">Kasserer (bøder og betalinger)</option>
          <option value="ADMIN">Træner/holdleder (alt)</option>
        </Select>
      </Field>
      <Field label="Trøjenummer" htmlFor="shirtNumber">
        <Input id="shirtNumber" name="shirtNumber" type="number" inputMode="numeric" min={0} max={999} defaultValue={member.shirtNumber ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="hidden" name="takesTasks" value="off" />
        <input type="checkbox" name="takesTasks" value="on" defaultChecked={member.takesTasks} className="h-4 w-4 accent-[var(--accent)]" />
        Med i den automatiske opgavefordeling
      </label>
    </FormDialog>
  );
}
