"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);
  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Adgangskode" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Logger ind…" : "Log ind"}
        </Button>
      </form>
    </Card>
  );
}
