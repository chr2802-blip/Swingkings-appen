import { prisma } from "./prisma";
import { safeFetch } from "./safe-fetch";
import { Prisma } from "@prisma/client";
import { classify, kampKlarDetails, normalizeCalendarUrl, parseCalendar, type CalendarEvent } from "./ical";
import { addTemplatesToActivity, moveTaskDeadlines } from "./tasks";

/** Past this, a calendar feed is not a team's season. */
const MAX_FEED_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 15_000;

export type SyncResult =
  | { ok: true; created: number; updated: number; cancelled: number; tasksAdded: number }
  | { ok: false; error: string };

/** The body as text, or null once it passes `max` bytes — without reading the rest. */
async function readCapped(response: Response, max: number): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

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
  const text = await readCapped(response, MAX_FEED_BYTES);
  if (text === null) return { ok: false, error: "Kalenderen er for stor." };
  if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, error: "Linket gav ikke en kalender. Brug linket fra “Eksporter kalender” i KampKlar." };
  return { ok: true, text };
}

/**
 * Brings a team's activities in line with its KampKlar feed.
 *
 * - An entry is matched to a row by its UID, so a moved match is updated rather than
 *   added twice, and a row typed in by hand is never touched. A moved activity takes its
 *   open jobs' deadlines along. The sync sends no notifications at all — not for new
 *   activities, moved ones or the jobs it hands out.
 * - Every entry becomes an activity — matches, trainings and the rest of KampKlar's feed.
 *   Only a new upcoming **match** gets the standard jobs marked to be added automatically
 *   (`TaskTemplate.autoAdd`) — all of them, or only home or away (`autoVenue`) —
 *   handed out fairly.
 * - An upcoming entry that has disappeared from the feed is marked cancelled rather than
 *   deleted: tasks and fines may already hang off it.
 * - The description's labels are read (`kampKlarDetails`): the link to the activity in
 *   KampKlar, the meeting place, the description proper and — when the feed carries
 *   them — who has signed up. A KampKlar activity is signed up for in KampKlar, not here.
 * - Nothing from before the season began is brought in: "Start ny sæson" deleted the
 *   activities that had taken place, and the feed still lists them.
 */
export async function applyCalendar(
  teamId: string,
  teamName: string,
  events: CalendarEvent[],
  actorId: string | null,
  now: Date = new Date(),
): Promise<Extract<SyncResult, { ok: true }>> {
  const [existing, team] = await Promise.all([
    prisma.match.findMany({
      where: { teamId, source: "KAMPKLAR" },
      select: { id: true, externalUid: true, startsAt: true, cancelledAt: true },
    }),
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { seasonStartedAt: true } }),
  ]);
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
    const details = kampKlarDetails(event);
    // A meeting place stands in for a missing LOCATION; beside a different one it is part of the note.
    const place = details.meetingPlace;
    const extraPlace = place && event.location && place !== event.location ? `Mødested: ${place}` : null;
    const data = {
      title,
      kind,
      opponent,
      isHome,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location ?? place,
      note: [extraPlace, details.note].filter(Boolean).join("\n\n") || null,
      externalUrl: details.link,
      externalSignups: details.signups ?? Prisma.DbNull,
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
      if (row.startsAt.getTime() !== event.startsAt.getTime()) {
        // The jobs keep their distance to the start. Nobody is told: the sync is silent,
        // and the new time is on the activity for whoever looks.
        await moveTaskDeadlines(teamId, row.id, row.startsAt, event.startsAt);
      }
    } else if (team.seasonStartedAt && event.startsAt < team.seasonStartedAt) {
      continue;
    } else {
      const match = await prisma.match.create({
        data: { ...data, teamId, source: "KAMPKLAR", externalUid: event.uid },
        select: { id: true, startsAt: true, isHome: true },
      });
      created++;
      if (kind === "MATCH" && !event.cancelled && match.startsAt > now) {
        // Silent: whoever gets a job sees it in the app, without a push for each new match.
        tasksAdded += (await addTemplatesToActivity(teamId, match, actorId, "auto", { notify: false })).length;
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

/** How long a sync is fresh enough that opening a page does not fetch the feed again. */
export const AUTO_SYNC_AFTER_MS = 2 * 60_000;

/**
 * The sync that opening the activities runs, at most once per `AUTO_SYNC_AFTER_MS` per team.
 * The turn is claimed in one guarded update of `calendarSyncedAt`, so two people opening
 * the page at once fetch the feed once. A failed fetch puts the time back, so the next
 * visit tries again. Null when it was not this visit's turn, or the team has no feed.
 */
export async function syncIfStale(teamId: string, now: Date = new Date()): Promise<SyncResult | null> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { calendarUrl: true, calendarSyncedAt: true } });
  if (!team?.calendarUrl) return null;
  const before = new Date(now.getTime() - AUTO_SYNC_AFTER_MS);
  const claimed = await prisma.team.updateMany({
    where: { id: teamId, calendarSyncedAt: team.calendarSyncedAt, OR: [{ calendarSyncedAt: null }, { calendarSyncedAt: { lt: before } }] },
    data: { calendarSyncedAt: now },
  });
  if (claimed.count === 0) return null;
  const result = await syncTeamCalendar(teamId, null).catch((error) => ({ ok: false as const, error: String(error) }));
  if (!result.ok) {
    await prisma.team.updateMany({ where: { id: teamId, calendarSyncedAt: now }, data: { calendarSyncedAt: team.calendarSyncedAt } });
  }
  return result;
}
