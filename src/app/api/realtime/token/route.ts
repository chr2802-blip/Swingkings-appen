import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeConfig, realtimeToken } from "@/lib/realtime";
import { teamTopic } from "@/lib/realtime-topic";

export const dynamic = "force-dynamic";

/** What the open chat asks before joining its team's Realtime channel — see `lib/realtime.ts`. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.teamId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = realtimeConfig();
  if (!config) return NextResponse.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
  const teamIds = [...new Set([...user.teams.map((team) => team.id), user.teamId])];
  const { token, expiresAt } = realtimeToken(config, user.id, teamIds);
  return NextResponse.json(
    {
      enabled: true,
      url: config.url,
      publishableKey: config.publishableKey,
      topic: teamTopic(user.teamId),
      token,
      expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
