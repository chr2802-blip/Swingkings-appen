import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * A push opened on the phone: the service worker (`public/sw.js`) reads its notification
 * in the center too. Only one's own, on the team on screen; any other id is "not found".
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id || !(await markRead(user.teamId, user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
