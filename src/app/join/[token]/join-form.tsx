"use client";

import { useActionState } from "react";
import { joinWithLink, joinWithLinkAsMe } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";
import { markJustLoggedIn } from "@/components/install-app";

export function JoinForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(joinWithLink, undefined);
  return (
    <Card>
      <form action={formAction} onSubmit={markJustLoggedIn} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Dit navn" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required maxLength={100} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field
          label="Adgangskode"
          htmlFor="password"
          hint="Mindst 8 tegn. Har du allerede en konto, så skriv din nuværende adgangskode."
        >
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Opretter…" : "Opret mig og kom med"}
        </Button>
      </form>
    </Card>
  );
}

export function JoinAsMeForm({ token, teamName }: { token: string; teamName: string }) {
  const [state, formAction, pending] = useActionState(joinWithLinkAsMe, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Et øjeblik…" : `Gå til ${teamName}`}
      </Button>
    </form>
  );
}
