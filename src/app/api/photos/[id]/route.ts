import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    ? await prisma.photo.findUnique({ where: { id }, select: { teamId: true, contentType: true, thumbBytes: true } })
    : await prisma.photo.findUnique({ where: { id }, select: { teamId: true, contentType: true, bytes: true } });
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

  const bytes = "thumbBytes" in photo ? photo.thumbBytes : photo.bytes;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": photo.contentType,
      "content-length": String(bytes.length),
      // A picture is never edited in place: replacing one stores a new row.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
