import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unreadChatCount } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** The chat button's count, asked on every chat nudge and when the chat is left. Reading it marks nothing read. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unread = await unreadChatCount(user.teamId, user.id);
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}
