import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { latestMessages, markChatSeen, olderMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";

/**
 * What the open chat redraws from, asked on every nudge and every fallback poll. It also says
 * the chat is open. With `?before=<id>` it answers the page of messages before that one
 * instead, as the chat is scrolled up.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const before = new URL(request.url).searchParams.get("before");
  if (before) {
    const page = await olderMessages(user.teamId, user.id, before);
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
  }
  const [page] = await Promise.all([latestMessages(user.teamId, user.id), markChatSeen(user.teamId, user.id)]);
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
