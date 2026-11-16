import { buildCalendar, feedActivities, teamForCalendarToken } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

/**
 * The team's activities as a calendar feed, fetched by a phone's calendar on its own —
 * with no session, so the token in the address is what lets it in (`calendar-feed.ts`).
 * A token that opens nothing is "not found", whatever was wrong with it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const team = await teamForCalendarToken(token);
  if (!team) return new Response("Not found", { status: 404 });
  const body = buildCalendar(team.name, await feedActivities(team.id), new URL(request.url).origin);
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="aktiviteter.ics"',
      // The token is in the address: no shared cache may keep the answer.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
