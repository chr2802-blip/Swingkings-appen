"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export function AcceptInviteForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite, undefined);
  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
        </Field>
        <Field label="Invitationskode" htmlFor="code">
          <Input id="code" name="code" autoComplete="one-time-code" placeholder="ABCD-EFGH" required />
        </Field>
        <Field label="Dit navn" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
        <Field
          label="Adgangskode"
          htmlFor="password"
          hint="Har du allerede en konto, så skriv din nuværende adgangskode."
        >
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Opretter…" : "Kom med på holdet"}
        </Button>
      </form>
    </Card>
  );
}
