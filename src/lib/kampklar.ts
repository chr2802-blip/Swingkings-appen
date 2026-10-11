import { prisma } from "./prisma";
import { safeFetch } from "./safe-fetch";
import { classify, normalizeCalendarUrl, parseCalendar, type CalendarEvent } from "./ical";
import { addTemplatesToMatch } from "./tasks";

/** Past this, a calendar feed is not a team's season. */
const MAX_FEED_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 15_000;

export type SyncResult =
  | { ok: true; created: number; updated: number; cancelled: number; tasksAdded: number }
  | { ok: false; error: string };

/** Fetches the feed, refusing an address that leads somewhere private and an oversized body. */
export async function fetchCalendar(rawUrl: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const url = normalizeCalendarUrl(rawUrl);
  if (!url) return { ok: false, error: "Kalenderlinket er ikke en gyldig adresse." };
  let response: Response;
  try {
    response = await safeFetch(url, {
      headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Kalenderen kunne ikke hentes. Tjek linket fra KampKlar." };
  }
  if (!response.ok) return { ok: false, error: `KampKlar svarede ${response.status}. Tjek linket.` };
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_FEED_BYTES) return { ok: false, error: "Kalenderen er for stor." };
  const text = await response.text();
  if (text.length > MAX_FEED_BYTES) return { ok: false, error: "Kalenderen er for stor." };
  if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, error: "Linket gav ikke en kalender. Brug linket fra “Eksporter kalender” i KampKlar." };
  return { ok: true, text };
}

/**
 * Brings a team's matches in line with its KampKlar feed.
 *
 * - An entry is matched to a row by its UID, so a moved match is updated rather than
 *   added twice, and a row typed in by hand is never touched.
 * - Training sessions and other activities are imported too (KampKlar's feed holds them
 *   all) and shown apart from matches; only a new **match** gets the team's standard
 *   jobs added and handed out.
 * - An upcoming entry that has disappeared from the feed is marked cancelled rather than
 *   deleted: tasks and fines may already hang off it.
 */
export async function applyCalendar(
  teamId: string,
  teamName: string,
  events: CalendarEvent[],
  actorId: string | null,
  now: Date = new Date(),
): Promise<Extract<SyncResult, { ok: true }>> {
  const existing = await prisma.match.findMany({
    where: { teamId, source: "KAMPKLAR" },
    select: { id: true, externalUid: true, startsAt: true, cancelledAt: true },
  });
  const byUid = new Map(existing.map((row) => [row.externalUid, row]));
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;
  let cancelled = 0;
  let tasksAdded = 0;

  for (const event of events) {
    if (seen.has(event.uid)) continue;
    seen.add(event.uid);
    const { kind, title, opponent, isHome } = classify(event, teamName);
    const data = {
      title,
      kind,
      opponent,
      isHome,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      note: event.description,
      cancelledAt: event.cancelled ? now : null,
    };
    const row = byUid.get(event.uid);
    if (row) {
      await prisma.match.update({
        where: { id: row.id },
        // Keeps the first moment it was seen cancelled rather than moving it every sync.
        data: { ...data, cancelledAt: event.cancelled ? (row.cancelledAt ?? now) : null },
      });
      updated++;
    } else {
      const match = await prisma.match.create({
        data: { ...data, teamId, source: "KAMPKLAR", externalUid: event.uid },
        select: { id: true, startsAt: true },
      });
      created++;
      if (kind === "MATCH" && !event.cancelled && match.startsAt > now) {
        tasksAdded += (await addTemplatesToMatch(teamId, match, actorId)).length;
      }
    }
  }

  for (const row of existing) {
    if (row.externalUid && !seen.has(row.externalUid) && row.startsAt > now && !row.cancelledAt) {
      await prisma.match.update({ where: { id: row.id }, data: { cancelledAt: now } });
      cancelled++;
    }
  }

  await prisma.team.update({ where: { id: teamId }, data: { calendarSyncedAt: now } });
  return { ok: true, created, updated, cancelled, tasksAdded };
}

export async function syncTeamCalendar(teamId: string, actorId: string | null): Promise<SyncResult> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true, calendarUrl: true } });
  if (!team?.calendarUrl) return { ok: false, error: "Holdet har ikke et KampKlar-kalenderlink endnu." };
  const feed = await fetchCalendar(team.calendarUrl);
  if (!feed.ok) return feed;
  return applyCalendar(teamId, team.name, parseCalendar(feed.text), actorId);
}
