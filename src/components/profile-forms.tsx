"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/ui";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { PhotoField } from "@/components/photo-field";
import { useFormAction } from "@/components/use-form-action";
import { changePassword, deleteMyAccount, setNewPassword, updateProfile } from "@/app/actions/profile";

export function ProfileForm({ name, photoId, canUpload }: { name: string; photoId: string | null; canUpload: boolean }) {
  return (
    <ActionForm action={updateProfile} submitLabel="Gem" className="space-y-4">
      <Field label="Navn" htmlFor="name">
        <Input id="name" name="name" defaultValue={name} maxLength={100} required />
      </Field>
      {canUpload && <PhotoField label="Profilbillede" defaultPhotoId={photoId} aspect="aspect-square max-w-40" />}
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} submitLabel="Skift adgangskode" resetOnSuccess className="space-y-4">
      <Field label="Nuværende adgangskode" htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Ny adgangskode" htmlFor="next" hint="Mindst 8 tegn.">
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
    </ActionForm>
  );
}

/** After a temporary password from an admin: one's own, without the old one (it was only lent). */
export function NewPasswordForm() {
  return (
    <ActionForm action={setNewPassword} submitLabel="Gem adgangskode" className="space-y-4">
      <Field label="Ny adgangskode" htmlFor="next" hint="Mindst 8 tegn.">
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
    </ActionForm>
  );
}

/** Deleting one's own account, in a drawer that asks for the password once more. */
export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const { state, pending, handleSubmit } = useFormAction(deleteMyAccount);
  return (
    <>
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        Slet min konto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Slet din konto?" size="drawer">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <ModalBody>
            <p className="mb-4 text-sm text-slate-600">
              Din profil, dine beskeder, opslag, kommentarer, billeder og stemmer slettes — på alle hold. Det kan ikke
              fortrydes.
            </p>
            <Field label="Din adgangskode" htmlFor="delete-password">
              <Input id="delete-password" name="password" type="password" autoComplete="current-password" required />
            </Field>
          </ModalBody>
          <ModalFooter>
            {state?.ok === false && (
              <p role="alert" className="mb-3 text-sm text-red-600">
                {state.error}
              </p>
            )}
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} className="flex-1 sm:flex-none">
                Annuller
              </Button>
              <Button type="submit" variant="danger" disabled={pending} aria-busy={pending} className="flex-1 sm:flex-none">
                Slet kontoen
              </Button>
            </div>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
