import { prisma } from "./prisma";
import { teamDb } from "./team-db";
import { MAX_PHOTO_BYTES, MAX_THUMB_BYTES, PHOTO_FIELD, checkPhotoBytes } from "./photo-file";

/**
 * How long an uploaded picture is kept before it counts as abandoned. A picture is
 * stored the moment it is chosen, so the form only carries its id; close the form
 * instead of saving and the picture belongs to nothing.
 */
const UNCLAIMED_MS = 60 * 60 * 1000;
const SWEEP_LIMIT = 20;

export type PhotoResult = { ok: true; id: string } | { ok: false; error: string };

/** Checks an upload — measured from its own bytes — and files it under a team. */
export async function storePhoto(teamId: string, full: Uint8Array, thumb: Uint8Array): Promise<PhotoResult> {
  const checkedFull = checkPhotoBytes(full, MAX_PHOTO_BYTES);
  if (!checkedFull.ok) return checkedFull;
  const checkedThumb = checkPhotoBytes(thumb, MAX_THUMB_BYTES);
  if (!checkedThumb.ok) return checkedThumb;

  const photo = await prisma.photo.create({
    data: {
      teamId,
      contentType: checkedFull.meta.contentType,
      width: checkedFull.meta.width,
      height: checkedFull.meta.height,
      bytes: Buffer.from(full),
      thumbWidth: checkedThumb.meta.width,
      thumbHeight: checkedThumb.meta.height,
      thumbBytes: Buffer.from(thumb),
    },
    select: { id: true },
  });
  return { ok: true, id: photo.id };
}

/**
 * A picture nothing points at: not a team's or a person's picture, not in a post, not in
 * the chat. Only these may be attached by a form (the one it already carries aside), and
 * only these may be deleted — otherwise attaching somebody else's picture to a message of
 * one's own, and then deleting the message, would delete theirs.
 */
const UNCLAIMED = {
  teams: { none: {} },
  users: { none: {} },
  postPhotos: { none: {} },
  chatMessages: { none: {} },
} as const;

export type PhotoChoice = { ok: true; photoId: string | null | undefined } | { ok: false; error: string };

/**
 * Reads the picture a form is attaching, looked up through `teamDb` so another team's
 * picture is simply not found. `undefined` means the form had no picture field at all;
 * empty means the picture was taken off.
 */
export async function readPhotoChoice(
  formData: FormData,
  teamId: string,
  /** The picture the record already has: it may be sent again, which keeps it. */
  current: string | null = null,
): Promise<PhotoChoice> {
  const raw = formData.get(PHOTO_FIELD);
  if (raw === null) return { ok: true, photoId: undefined };
  const id = String(raw).trim();
  if (!id) return { ok: true, photoId: null };
  const photo = await teamDb(teamId).photo.findFirst({
    where: { id, ...(id === current ? {} : UNCLAIMED) },
    select: { id: true },
  });
  return photo ? { ok: true, photoId: photo.id } : { ok: false, error: "Billedet findes ikke længere." };
}

/**
 * Removes pictures nothing points at any more. Already gone is not an error, and one
 * something still points at is left alone.
 */
export async function discardPhotos(teamId: string, photoIds: (string | null | undefined)[]) {
  const ids = photoIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;
  await teamDb(teamId).photo.deleteMany({ where: { id: { in: ids }, ...UNCLAIMED } });
}

export async function discardPhoto(teamId: string, photoId: string | null | undefined) {
  await discardPhotos(teamId, [photoId]);
}

/** The replaced picture, when a form has swapped one for another or taken it off. */
export async function discardReplaced(teamId: string, previous: string | null, chosen: string | null | undefined) {
  if (chosen === undefined || previous === null || previous === chosen) return;
  await discardPhoto(teamId, previous);
}

/** Clears uploads never attached to anything; run after each successful upload. */
export async function sweepUnclaimedPhotos(teamId: string) {
  const db = teamDb(teamId);
  const unclaimed = await db.photo.findMany({
    where: { createdAt: { lt: new Date(Date.now() - UNCLAIMED_MS) }, ...UNCLAIMED },
    select: { id: true },
    take: SWEEP_LIMIT,
  });
  if (unclaimed.length === 0) return 0;
  await db.photo.deleteMany({ where: { id: { in: unclaimed.map((photo) => photo.id) } } });
  return unclaimed.length;
}

/**
 * Reads every picture a form is attaching (a feed post takes several), in the order
 * chosen. Each id is looked up through `teamDb`, so another team's picture is not found.
 */
export async function readPhotoChoices(
  formData: FormData,
  teamId: string,
  max: number,
): Promise<{ ok: true; photoIds: string[] } | { ok: false; error: string }> {
  const ids = [...new Set(formData.getAll(PHOTO_FIELD).map((v) => String(v).trim()).filter(Boolean))];
  if (ids.length > max) return { ok: false, error: `Højst ${max} billeder pr. opslag.` };
  if (ids.length === 0) return { ok: true, photoIds: [] };
  const found = await teamDb(teamId).photo.findMany({ where: { id: { in: ids }, ...UNCLAIMED }, select: { id: true } });
  if (found.length !== ids.length) return { ok: false, error: "Et af billederne findes ikke længere." };
  return { ok: true, photoIds: ids };
}
