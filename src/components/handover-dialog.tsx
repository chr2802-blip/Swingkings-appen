"use client";

import { FormDialog } from "@/components/form-dialog";
import { Avatar } from "@/components/photo";
import { Field, Textarea } from "@/components/ui";
import { handOverTask } from "@/app/actions/tasks";

const option =
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_10%,white)]";

/**
 * Giving your place on a job away: ask the whole team in the chat, or one teammate. Either
 * way nothing moves until somebody says yes; until then the job is still yours.
 */
export function GiveAwayDialog({
  taskId,
  members,
}: {
  taskId: string;
  members: { userId: string; name: string; photoId: string | null }[];
}) {
  return (
    <FormDialog trigger="Giv videre" triggerVariant="secondary" title="Giv opgaven videre" action={handOverTask} submitLabel="Spørg">
      <input type="hidden" name="id" value={taskId} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Hvem vil du spørge?</legend>
        <div className="space-y-1 rounded-xl border border-slate-200 p-1.5">
          <label className={option}>
            <input type="radio" name="toId" value="chat" defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
            <span aria-hidden className="flex h-6 w-6 items-center justify-center text-base">
              💬
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Hele holdet i chatten</span>
              <span className="block text-xs text-slate-500">Den første, der siger ja, overtager.</span>
            </span>
          </label>
          {members.length > 0 && (
            <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto border-t border-slate-100 pt-1 sm:grid-cols-2">
              {members.map((m) => (
                <label key={m.userId} className={option}>
                  <input type="radio" name="toId" value={m.userId} className="h-4 w-4 accent-[var(--accent)]" />
                  <Avatar name={m.name} photoId={m.photoId} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>
      <Field label="Besked (valgfri)" htmlFor="handover-note" hint="Fx hvorfor du ikke kan.">
        <Textarea id="handover-note" name="note" rows={2} maxLength={500} />
      </Field>
      <p className="text-xs text-slate-500">Du har opgaven, indtil nogen siger ja.</p>
    </FormDialog>
  );
}
