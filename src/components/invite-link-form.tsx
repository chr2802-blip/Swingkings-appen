"use client";

import { Button, Field, Select } from "@/components/ui";
import { ShareLink, isJoinPath } from "@/components/share-link";
import { useFormAction } from "@/components/use-form-action";
import { createInviteLink } from "@/app/actions/teams";
import { DEFAULT_LINK_DAYS, DEFAULT_LINK_MAX_USES, LINK_DAYS, LINK_MAX_USES } from "@/lib/invite-link-options";

const DAYS_LABEL: Record<number, string> = { 1: "1 dag", 7: "1 uge", 14: "2 uger", 30: "30 dage" };

export function InviteLinkForm({ teamName }: { teamName: string }) {
  const { state, pending, handleSubmit } = useFormAction(createInviteLink);
  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Gælder i" htmlFor="link-days">
        <Select id="link-days" name="days" defaultValue={String(DEFAULT_LINK_DAYS)}>
          {LINK_DAYS.map((days) => (
            <option key={days} value={days}>
              {DAYS_LABEL[days] ?? `${days} dage`}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Højst antal personer" htmlFor="link-uses">
        <Select id="link-uses" name="maxUses" defaultValue={String(DEFAULT_LINK_MAX_USES)}>
          {LINK_MAX_USES.map((uses) => (
            <option key={uses} value={uses}>
              {uses === 1 ? "1 person" : `${uses} personer`}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Laver link…" : "Lav invitationslink"}
        </Button>
        {state?.ok === false && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
      {state?.ok && isJoinPath(state.note) && (
        <div className="sm:col-span-2">
          <ShareLink path={state.note} teamName={teamName} />
        </div>
      )}
    </form>
  );
}
