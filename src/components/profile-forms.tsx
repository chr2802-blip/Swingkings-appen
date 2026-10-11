"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { PhotoField } from "@/components/photo-field";
import { changePassword, updateProfile } from "@/app/actions/profile";

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
