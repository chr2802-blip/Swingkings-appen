"use client";

import { FormDialog } from "@/components/form-dialog";
import { Field, Textarea } from "@/components/ui";
import { PhotoField } from "@/components/photo-field";
import { createPost } from "@/app/actions/social";

export function PostDialog() {
  return (
    <FormDialog trigger="Nyt opslag" title="Del med holdet" action={createPost} submitLabel="Del">
      <PhotoField label="Billede" />
      <Field label="Tekst" htmlFor="body">
        <Textarea id="body" name="body" rows={3} maxLength={4000} placeholder="Hvad skete der?" />
      </Field>
    </FormDialog>
  );
}
