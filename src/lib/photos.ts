import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { fullKey, putObject, removeObjects, storageConfig, thumbKey } from "./storage";
import { teamDb } from "./team-db";
import { MAX_PHOTO_BYTES, MAX_THUMB_BYTES, PHOTO_FIELD, checkPhotoBytes } from "./photo-file";

/**
 * How long an uploaded picture is kept before it counts as abandoned. A picture is
 * stored the moment it is chosen, so the form only carries its id; close the form
 * instead of saving and the picture belongs to nothing.
 */
const UNCLAIMED_MS = 60 * 60 * 1000;
const SWEEP_LIMIT = 20;

/**
 * How many pictures one team may keep — a ceiling on what one team can fill the storage
 * with, at a few hundred kilobytes each. Deleting posts and messages frees room.
 */
export const MAX_TEAM_PHOTOS = 2000;

export type PhotoResult = { ok: true; id: string } | { ok: false; error: string };

/** Checks an upload — measured from its own bytes — and files it under a team. */
export async function storePhoto(teamId: string, full: Uint8Array, thumb: Uint8Array): Promise<PhotoResult> {
  const checkedFull = checkPhotoBytes(full, MAX_PHOTO_BYTES);
  if (!checkedFull.ok) return checkedFull;
  const checkedThumb = checkPhotoBytes(thumb, MAX_THUMB_BYTES);
  if (!checkedThumb.ok) return checkedThumb;

  if ((await prisma.photo.count({ where: { teamId } })) >= MAX_TEAM_PHOTOS) {
    return { ok: false, error: "Holdet har nået grænsen for billeder. Slet gamle opslag eller beskeder med billeder." };
  }

  const meta = {
    teamId,
    contentType: checkedFull.meta.contentType,
    width: checkedFull.meta.width,
    height: checkedFull.meta.height,
    thumbWidth: checkedThumb.meta.width,
    thumbHeight: checkedThumb.meta.height,
  };

  const storage = storageConfig();
  if (!storage) {
    const photo = await prisma.photo.create({
      data: { ...meta, bytes: Buffer.from(full), thumbBytes: Buffer.from(thumb) },
      select: { id: true },
    });
    return { ok: true, id: photo.id };
  }

  // The objects first, the row second: a row never points at nothing. One that fails
  // half-way leaves objects behind, which are taken away again.
  const key = `${teamId}/${randomUUID()}`;
  try {
    await putObject(storage, fullKey(key), full, meta.contentType);
    await putObject(storage, thumbKey(key), thumb, checkedThumb.meta.contentType);
  } catch (error) {
    await removeObjects(storage, [fullKey(key), thumbKey(key)]);
    console.error(JSON.stringify({ event: "photo_store_failed", error: error instanceof Error ? error.message : String(error) }));
    return { ok: false, error: "Billedet kunne ikke gemmes. Prøv igen." };
  }
  let photo;
  try {
    photo = await prisma.photo.create({ data: { ...meta, storageKey: key }, select: { id: true } });
  } catch (error) {
    await removeObjects(storage, [fullKey(key), thumbKey(key)]);
    throw error;
  }
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
 * Removes the objects of pictures whose rows are gone. `keys` were read before the rows
 * were deleted; anything in them is no one's now.
 */
export async function removeStored(keys: (string | null)[]) {
  const storage = storageConfig();
  const named = keys.filter((key): key is string => Boolean(key));
  if (!storage || named.length === 0) return;
  await removeObjects(storage, named.flatMap((key) => [fullKey(key), thumbKey(key)]));
}

/**
 * Deletes the pictures among `ids` that nothing points at, rows and objects both, and
 * says how many went. One something still points at is left alone — it may have been
 * claimed since we looked, so the delete asks again and only what is truly gone loses
 * its objects.
 */
async function deleteUnclaimed(teamId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = teamDb(teamId);
  const rows = await db.photo.findMany({ where: { id: { in: ids }, ...UNCLAIMED }, select: { id: true, storageKey: true } });
  if (rows.length === 0) return 0;
  await db.photo.deleteMany({ where: { id: { in: rows.map((row) => row.id) }, ...UNCLAIMED } });
  const left = new Set((await db.photo.findMany({ where: { id: { in: rows.map((row) => row.id) } }, select: { id: true } })).map((row) => row.id));
  const gone = rows.filter((row) => !left.has(row.id));
  await removeStored(gone.map((row) => row.storageKey));
  return gone.length;
}

/**
 * Removes pictures nothing points at any more. Already gone is not an error, and one
 * something still points at is left alone.
 */
export async function discardPhotos(teamId: string, photoIds: (string | null | undefined)[]) {
  await deleteUnclaimed(teamId, photoIds.filter((id): id is string => Boolean(id)));
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
  return deleteUnclaimed(teamId, unclaimed.map((photo) => photo.id));
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
