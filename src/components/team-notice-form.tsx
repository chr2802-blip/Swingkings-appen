"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { sendTeamNotice } from "@/app/actions/notifications";
import { MAX_NOTICE_BODY, MAX_NOTICE_TITLE, NOTICE_DESTINATIONS, type NoticeDestination } from "@/lib/team-notice";

/** "Send notifikation" on the team settings: to one person or everybody, opening where it is told. */
export function TeamNoticeForm({
  members,
  hasMobilePay,
}: {
  /** Everybody on the team but the admin sending. */
  members: { userId: string; name: string }[];
  hasMobilePay: boolean;
}) {
  const [destination, setDestination] = useState<NoticeDestination>("oversigt");
  const { state, pending, handleSubmit } = useFormAction(sendTeamNotice, {
    onSuccess: (form) => {
      form.reset();
      setDestination("oversigt");
    },
  });
  const destinations = NOTICE_DESTINATIONS.filter((d) => hasMobilePay || d.value !== "mobilepay-kontingent");

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Til" htmlFor="notice-to">
        <Select id="notice-to" name="to" defaultValue="alle">
          <option value="alle">Hele holdet</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Åbner" htmlFor="notice-destination" hint="Hvor man lander, når man trykker på notifikationen.">
        <Select
          id="notice-destination"
          name="destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value as NoticeDestination)}
        >
          {destinations.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>
      {destination === "link" && (
        <div className="sm:col-span-2">
          <Field label="Link" htmlFor="notice-link" hint="En hel adresse, der starter med https://">
            <Input id="notice-link" name="link" type="url" inputMode="url" placeholder="https://" required />
          </Field>
        </div>
      )}
      {destination === "mobilepay-kontingent" && (
        <p className="text-xs text-slate-500 sm:col-span-2">
          Åbner holdets MobilePay med kontingentet og “Kontingent – navn” udfyldt for hver enkelt.
        </p>
      )}
      <div className="sm:col-span-2">
        <Field label="Overskrift" htmlFor="notice-title">
          <Input id="notice-title" name="title" maxLength={MAX_NOTICE_TITLE} placeholder="Husk kontingent 💰" required />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Besked" htmlFor="notice-body">
          <Textarea id="notice-body" name="body" rows={3} maxLength={MAX_NOTICE_BODY} placeholder="Kontingentet skal betales inden 1. december." required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Sender…" : "Send notifikation"}
        </Button>
        {state?.ok === false && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="text-sm text-emerald-700">
            {state.note}
          </p>
        )}
      </div>
    </form>
  );
}
