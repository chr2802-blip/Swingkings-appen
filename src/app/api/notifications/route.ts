import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { notificationCenter } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** The notification center, asked when the bell is opened: one's own on the team on screen. Reading it marks nothing. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await notificationCenter(user.teamId, user.id), { headers: { "Cache-Control": "no-store" } });
}
