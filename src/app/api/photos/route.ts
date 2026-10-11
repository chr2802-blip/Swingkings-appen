import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_PHOTO_BYTES, MAX_THUMB_BYTES } from "@/lib/photo-file";
import { storePhoto, sweepUnclaimedPhotos } from "@/lib/photos";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Takes a picture the browser has already shrunk and files it under the caller's team,
 * answering with its id. The session cookie is SameSite=Lax, so another site's form
 * cannot post here as a signed-in player.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.teamId) return refuse("Log ind først.", 401);

  const limit = await checkRateLimit("photo", user.id);
  if (!limit.allowed) return refuse(`For mange billeder. Prøv igen om ${limit.retryAfterMinutes} min.`, 429);
  await recordFailedAttempt("photo", user.id);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse("Uploaden kunne ikke læses.", 400);
  }
  const full = await readPart(form.get("photo"), MAX_PHOTO_BYTES);
  const thumb = await readPart(form.get("thumb"), MAX_THUMB_BYTES);
  if (!full || !thumb) return refuse("Uploaden havde intet billede.", 400);

  const stored = await storePhoto(user.teamId, full, thumb);
  if (!stored.ok) return refuse(stored.error, 400);
  await sweepUnclaimedPhotos(user.teamId).catch(() => {});
  return NextResponse.json({ id: stored.id }, { headers: { "cache-control": "no-store" } });
}

async function readPart(part: FormDataEntryValue | null, maxBytes: number) {
  if (!(part instanceof File) || part.size === 0 || part.size > maxBytes) return null;
  return new Uint8Array(await part.arrayBuffer());
}

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
