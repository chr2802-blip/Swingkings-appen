"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Select, Textarea } from "@/components/ui";
import { offerTask } from "@/app/actions/tasks";

/**
 * Asks somebody else on the team to take over your place on a job. They have to accept
 * before anything moves.
 */
export function HandoverDialog({ taskId, members }: { taskId: string; members: { userId: string; name: string }[] }) {
  return (
    <FormDialog trigger="Giv opgaven videre" triggerVariant="secondary" title="Giv opgaven videre" action={offerTask} submitLabel="Spørg">
      <input type="hidden" name="id" value={taskId} />
      <p className="text-sm text-slate-600">Den du vælger, skal sige ja, før opgaven er deres. Indtil da har du den stadig.</p>
      <Field label="Hvem skal overtage?" htmlFor="toId">
        <Select id="toId" name="toId" required defaultValue="">
          <option value="" disabled>
            Vælg en spiller
          </option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Besked" htmlFor="note" hint="Fx hvorfor du ikke kan.">
        <Textarea id="note" name="note" rows={2} maxLength={500} />
      </Field>
    </FormDialog>
  );
}
