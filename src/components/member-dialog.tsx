"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Input } from "@/components/ui";
import { updateMember } from "@/app/actions/teams";

/**
 * Shirt number, the job rota and the name KampKlar knows them by. Role and kontingent
 * are ticked in the members table.
 */
export function MemberDialog({
  member,
  kampklarNames = [],
}: {
  member: { userId: string; name: string; shirtNumber: number | null; takesTasks: boolean; kampklarName: string | null };
  kampklarNames?: string[];
}) {
  const listId = `kampklar-names-${member.userId}`;
  return (
    <FormDialog trigger="Ret" triggerVariant="ghost" title={member.name} action={updateMember} submitLabel="Gem" size="drawer">
      <input type="hidden" name="userId" value={member.userId} />
      <Field label="Trøjenummer" htmlFor="shirtNumber">
        <Input id="shirtNumber" name="shirtNumber" type="number" inputMode="numeric" min={0} max={999} defaultValue={member.shirtNumber ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="hidden" name="takesTasks" value="off" />
        <input type="checkbox" name="takesTasks" value="on" defaultChecked={member.takesTasks} className="h-4 w-4 accent-[var(--accent)]" />
        Med i den automatiske opgavefordeling
      </label>
      <Field
        label="Navn i KampKlar"
        htmlFor={`kampklarName-${member.userId}`}
        hint="Kun hvis navnet i KampKlar er et andet, så tilmeldingerne fra KampKlar bliver koblet til den rigtige."
      >
        <Input
          id={`kampklarName-${member.userId}`}
          name="kampklarName"
          list={listId}
          maxLength={120}
          autoComplete="off"
          defaultValue={member.kampklarName ?? ""}
        />
        <datalist id={listId}>
          {kampklarNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>
    </FormDialog>
  );
}
