import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { latestMessages, markChatSeen } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** What the open chat redraws from, asked on every nudge and every fallback poll. It also says the chat is open. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [messages] = await Promise.all([latestMessages(user.teamId, user.id), markChatSeen(user.teamId, user.id)]);
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
