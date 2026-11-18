import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * A club's crest, to anybody signed in: crests are shared by every team, and nobody's
 * private. A crest is never changed in place (a new one is a new row), so it is cached
 * for good. Signed out, or an id that is not one: "not found".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return new Response("Not found", { status: 404 });
  const logo = await prisma.clubLogo.findUnique({ where: { id }, select: { contentType: true, bytes: true } });
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.contentType,
      "content-length": String(logo.bytes.length),
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
