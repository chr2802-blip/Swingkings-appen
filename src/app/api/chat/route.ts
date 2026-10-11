import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { latestMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** What the open chat redraws from, asked on every nudge and every fallback poll. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ messages: await latestMessages(user.teamId) }, { headers: { "Cache-Control": "no-store" } });
}
