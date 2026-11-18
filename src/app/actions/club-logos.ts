"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { field } from "@/lib/form";
import { checkPhotoBytes } from "@/lib/photo-file";
import { clubKey, MAX_LOGO_BYTES } from "@/lib/club-logos";

/**
 * The super admin puts in a club's crest, for every team: a club's name and a picture
 * (PNG, JPEG or WebP — a PNG keeps its see-through background). A club that has one gets
 * the new one in its place, as a new row, so its address changes and no browser shows
 * the old one from its cache.
 */
export async function saveClubLogo(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const name = field(formData, "name").trim().replace(/\s+/g, " ");
  const key = clubKey(name);
  if (!key || name.length > 80) return fail("Skriv klubbens navn, som det står i kampprogrammet.");
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return fail("Vælg et logo.");
  if (file.size > MAX_LOGO_BYTES) return fail("Logoet er for stort. Højst 300 kB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkPhotoBytes(bytes, MAX_LOGO_BYTES);
  if (!checked.ok) return fail(checked.error);

  await prisma.$transaction([
    prisma.clubLogo.deleteMany({ where: { key } }),
    prisma.clubLogo.create({
      data: { key, name, contentType: checked.meta.contentType, width: checked.meta.width, height: checked.meta.height, bytes },
    }),
  ]);
  revalidatePath("/", "layout");
  return ok(`Logoet for ${name} er gemt.`);
}

export async function deleteClubLogo(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.clubLogo.deleteMany({ where: { id: field(formData, "id") } });
  revalidatePath("/", "layout");
  return ok();
}
