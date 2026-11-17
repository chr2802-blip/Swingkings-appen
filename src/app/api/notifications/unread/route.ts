import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unseenCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** The bell's count, asked on every nudge and on a slow poll. Reading it marks nothing seen. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unseen = await unseenCount(user.teamId, user.id);
  return NextResponse.json({ unseen }, { headers: { "Cache-Control": "no-store" } });
}
