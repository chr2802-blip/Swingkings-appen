"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { deleteAccount, deletionBlocker } from "@/lib/account";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { readForm, requiredText } from "@/lib/form";
import { readPhotoChoice } from "@/lib/photos";
import { PHOTO_FIELD } from "@/lib/photo-file";

export async function updateProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const form = readForm(z.object({ name: requiredText("Skriv dit navn.", 100) }), formData);
  if (!form.ok) return fail(form.error);

  // A person's picture is filed under the team on screen — an upload has to be filed
  // somewhere — and `/api/photos` serves it to anybody who shares a team with them.
  let photoId: string | null | undefined;
  if (user.teamId && formData.has(PHOTO_FIELD)) {
    const photo = await readPhotoChoice(formData, user.teamId, user.photoId);
    if (!photo.ok) return fail(photo.error);
    photoId = photo.photoId;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: form.fields.name, ...(photoId !== undefined ? { photoId } : {}) },
  });
  revalidatePath("/", "layout");
  return ok();
}

const passwordSchema = z.object({
  current: z.string().min(1, "Skriv din nuværende adgangskode."),
  next: z.string().min(8, "Den nye adgangskode skal være mindst 8 tegn."),
});

/** Ends every other session: the version in their cookies stops matching. */
export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const form = readForm(passwordSchema, formData);
  if (!form.ok) return fail(form.error);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(form.fields.current, row.passwordHash))) return fail("Den nuværende adgangskode er forkert.");
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(form.fields.next), tokenVersion: { increment: 1 }, mustChangePassword: false },
  });
  await createSession(updated.id, updated.tokenVersion);
  return ok("Adgangskoden er skiftet. Du er logget ud alle andre steder.");
}

const newPasswordSchema = z.object({
  next: z.string().min(8, "Adgangskoden skal være mindst 8 tegn."),
});

/**
 * The first thing after logging in with a temporary password an admin gave
 * (`resetMemberPassword`): they choose their own, and nobody else knows it. Only for that
 * — anybody else changes theirs with the current one (`changePassword`).
 */
export async function setNewPassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.mustChangePassword) return fail("Skift din adgangskode under Profil.");
  const form = readForm(newPasswordSchema, formData);
  if (!form.ok) return fail(form.error);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(form.fields.next), tokenVersion: { increment: 1 }, mustChangePassword: false },
  });
  await createSession(updated.id, updated.tokenVersion);
  redirect("/oversigt");
}

/**
 * Deletes one's own account for good, after the password is given once more. Refused
 * while `deletionBlocker` says why (super admin, a team's last admin, fines owed).
 */
export async function deleteMyAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const password = formData.get("password");
  if (typeof password !== "string" || password === "") return fail("Skriv din adgangskode.");
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(password, row.passwordHash))) return fail("Adgangskoden er forkert.");
  const blocker = await deletionBlocker(user.id);
  if (blocker) return fail(blocker);
  await deleteAccount(user.id);
  await destroySession();
  redirect("/login?slettet=1");
}
