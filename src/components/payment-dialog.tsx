"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Input, Select } from "@/components/ui";
import { recordPayment } from "@/app/actions/fines";

/** Registering money paid into the box — MobilePay, cash, whatever the team uses. */
export function PaymentDialog({
  members,
  defaultPlayerId,
  defaultAmount,
}: {
  members: { userId: string; name: string }[];
  defaultPlayerId?: string;
  defaultAmount?: number;
}) {
  return (
    <FormDialog
      trigger="Betaling"
      triggerVariant="secondary"
      title="Registrér betaling"
      action={recordPayment}
      submitLabel="Registrér"
      size="drawer"
    >
      <Field label="Hvem har betalt?" htmlFor="playerId">
        <Select id="playerId" name="playerId" defaultValue={defaultPlayerId ?? ""} required>
          <option value="" disabled>
            Vælg spiller…
          </option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Beløb (kr)" htmlFor="amountKr">
        <Input
          id="amountKr"
          name="amountKr"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={defaultAmount && defaultAmount > 0 ? defaultAmount : undefined}
          required
        />
      </Field>
      <Field label="Note (valgfri)" htmlFor="note">
        <Input id="note" name="note" placeholder="Fx MobilePay" maxLength={200} />
      </Field>
    </FormDialog>
  );
}
