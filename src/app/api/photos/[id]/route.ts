import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fullKey, getObject, storageConfig, thumbKey } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves a stored picture to somebody on the team it belongs to — and a person's own
 * picture to anybody who shares a team with them, wherever it happens to be filed.
 * Anything else is "not found", the same as an id that never existed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const thumb = new URL(request.url).searchParams.get("size") === "thumb";
  const photo = thumb
    ? await prisma.photo.findUnique({ where: { id }, select: { teamId: true, contentType: true, storageKey: true, thumbBytes: true } })
    : await prisma.photo.findUnique({ where: { id }, select: { teamId: true, contentType: true, storageKey: true, bytes: true } });
  if (!photo) return new Response("Not found", { status: 404 });

  const teamIds = user.teams.map((team) => team.id);
  const reachable = photo.teamId === user.teamId || teamIds.includes(photo.teamId);
  const teammatesOwn =
    !reachable &&
    teamIds.length > 0 &&
    (await prisma.user.count({
      where: { photoId: id, memberships: { some: { teamId: { in: teamIds } } } },
    })) > 0;
  if (!reachable && !teammatesOwn) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "content-type": photo.contentType,
    // A picture is never edited in place: replacing one stores a new row.
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  };

  if (photo.storageKey) {
    // The session has been checked above; the bucket itself is private, so this is the only way in.
    const storage = storageConfig();
    if (!storage) return new Response("Storage is not configured", { status: 503 });
    let object: Response | null;
    try {
      object = await getObject(storage, thumb ? thumbKey(photo.storageKey) : fullKey(photo.storageKey));
    } catch {
      return new Response("Storage failed", { status: 502, headers: { "cache-control": "no-store" } });
    }
    if (!object?.body) return new Response("Not found", { status: 404 });
    const length = object.headers.get("content-length");
    if (length) headers["content-length"] = length;
    return new Response(object.body, { headers });
  }

  const bytes = "thumbBytes" in photo ? photo.thumbBytes : photo.bytes;
  if (!bytes) return new Response("Not found", { status: 404 });
  headers["content-length"] = String(bytes.length);
  return new Response(new Uint8Array(bytes), { headers });
}
