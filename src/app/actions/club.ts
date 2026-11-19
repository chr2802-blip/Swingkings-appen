"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireTeamUser } from "@/lib/auth";
import { assertClubAdmin } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { field, MAX_MESSAGE, optionalText, readForm, requiredText } from "@/lib/form";
import { discardPhotosWhereFiled, readPhotoChoices } from "@/lib/photos";
import { MAX_POST_PHOTOS } from "@/lib/polls";
import { readPollForm } from "@/lib/poll-form";
import { FEED_CHANGED } from "@/lib/realtime-topic";
import { announceTo, notifyEverybodyOn } from "@/lib/club-reach";
import { chosenClubTeams, clubOfTeam, MAX_CLUB_NAME, pruneClubAdmins, setTeamClub, unshareActivity } from "@/lib/clubs";
import { moveTaskDeadlines } from "@/lib/tasks";
import { kickoffLabel, parseLocalDateTime } from "@/lib/time";

/**
 * The club level: the super admin makes clubs, puts teams in them and names their club
 * admins; a club admin writes club posts and makes club activities for the teams they
 * choose. Everything here crosses teams on purpose, so it uses `prisma`, and every row a
 * club admin touches is looked up within their club.
 */

function refreshAll() {
  revalidatePath("/", "layout");
}

/* ── The super admin ────────────────────────────────────────────────────────────── */

const clubName = z.object({ name: requiredText("Giv klubben et navn.", MAX_CLUB_NAME) });

export async function createClub(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const form = readForm(clubName, formData);
  if (!form.ok) return fail(form.error);
  await prisma.club.create({ data: { name: form.fields.name } });
  refreshAll();
  return ok();
}

/**
 * Deletes a club and what it made — its posts and activities, with the comments, votes and
 * sign-ups on them. Its teams stay, on their own.
 */
export async function deleteClub(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = field(formData, "clubId");
  const photos = await prisma.postPhoto.findMany({ where: { post: { clubId: id } }, select: { photoId: true } });
  await prisma.club.deleteMany({ where: { id } });
  await discardPhotosWhereFiled(photos.map((p) => p.photoId));
  refreshAll();
  return ok();
}

/** Puts a team in a club, moves it, or takes it out (`clubId` empty) — see `setTeamClub`. */
export async function setTeamClubAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const teamId = field(formData, "teamId");
  const clubId = field(formData, "clubId") || null;
  if (!(await prisma.team.count({ where: { id: teamId } }))) return fail("Holdet findes ikke.");
  if (clubId && !(await prisma.club.count({ where: { id: clubId } }))) return fail("Klubben findes ikke.");
  await setTeamClub(teamId, clubId);
  refreshAll();
  return ok();
}

/** Names a club admin: somebody playing on one of the club's teams — a club admin is always a player too. */
export async function addClubAdmin(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const clubId = field(formData, "clubId");
  const userId = field(formData, "userId");
  if (!(await prisma.club.count({ where: { id: clubId } }))) return fail("Klubben findes ikke.");
  if (!(await prisma.teamMember.count({ where: { userId, team: { clubId } } }))) {
    return fail("En klubadmin skal spille på et af klubbens hold.");
  }
  await prisma.clubAdmin.upsert({ where: { clubId_userId: { clubId, userId } }, create: { clubId, userId }, update: {} });
  refreshAll();
  return ok();
}

export async function removeClubAdmin(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.clubAdmin.deleteMany({ where: { clubId: field(formData, "clubId"), userId: field(formData, "userId") } });
  await pruneClubAdmins(field(formData, "clubId"));
  refreshAll();
  return ok();
}

/* ── The club admin ─────────────────────────────────────────────────────────────── */

/** The club of the team on screen, which the person must be a club admin of. */
async function clubInCharge() {
  const user = await requireTeamUser();
  const club = await clubOfTeam(user.teamId);
  assertClubAdmin(user, club?.id);
  return { user, club: club! };
}

const body = z.string().trim().max(MAX_MESSAGE).optional().transform((v) => v || null);

/**
 * A club post: pictures, words, a poll — as a team's post — shown in the feed of each of the
 * club's teams chosen (`teamId`, repeated), where everybody on them comments, reacts and
 * votes on the same post. A club poll's answers are typed. Everybody on those teams hears
 * of it once.
 */
export async function createClubPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, club } = await clubInCharge();
  const teamIds = await chosenClubTeams(club.id, formData);
  if (!teamIds) return fail("Vælg de hold, opslaget skal ud til.");
  const text = body.safeParse(formData.get("body") ?? undefined);
  if (!text.success) return fail(`Teksten er for lang (højst ${MAX_MESSAGE} tegn).`);
  // Uploaded on the team on screen, and filed there.
  const photos = await readPhotoChoices(formData, user.teamId, MAX_POST_PHOTOS);
  if (!photos.ok) return fail(photos.error);
  const read = readPollForm(formData, null);
  if (!read.ok) return fail(read.error);
  const poll = read.poll;
  if (!text.data && photos.photoIds.length === 0 && !poll) return fail("Vælg billeder, skriv noget eller lav en afstemning.");

  const post = await prisma.post.create({
    data: {
      clubId: club.id,
      authorId: user.id,
      body: text.data,
      teams: { create: teamIds.map((teamId) => ({ teamId })) },
      photos: { create: photos.photoIds.map((photoId, position) => ({ photoId, position })) },
      ...(poll
        ? {
            poll: {
              create: {
                clubId: club.id,
                question: poll.question,
                anonymous: poll.anonymous,
                multipleChoice: poll.multipleChoice,
                hideResults: poll.hideResults,
                closesAt: poll.closesAt,
                options: { create: poll.options.map((o, position) => ({ ...o, position })) },
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });
  await notifyEverybodyOn(teamIds, user.id, {
    category: "FEED",
    postId: post.id,
    title: poll ? `${club.name} har lavet en afstemning 🗳️` : `Nyt fra ${club.name}`,
    body: poll ? poll.question : (text.data?.slice(0, 140) ?? (photos.photoIds.length > 1 ? `📷 ${photos.photoIds.length} nye billeder` : "📷 Nyt billede")),
    url: "/oversigt#feed",
    tag: "feed",
  });
  announceTo(teamIds, FEED_CHANGED);
  revalidatePath("/oversigt");
  revalidatePath("/klub");
  return ok();
}

const activitySchema = z.object({
  title: requiredText("Giv aktiviteten et navn.", 200),
  startsAt: z.string().min(1, "Vælg tidspunkt for aktiviteten."),
  location: optionalText,
  note: optionalText,
});

/**
 * A club activity — klubdag, generalforsamling, oprydning — made or changed by a club
 * admin and shared with the club's teams chosen (`teamId`, repeated). Everybody on them
 * signs up and comments on the same activity; each team puts its own jobs on it. A team
 * taken off loses it, with its sign-ups, comments and jobs on it. Those it is new to hear
 * of it; moved, everybody on it hears the new time.
 */
export async function saveClubActivity(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, club } = await clubInCharge();
  const form = readForm(activitySchema, formData);
  if (!form.ok) return fail(form.error);
  const startsAt = parseLocalDateTime(form.fields.startsAt);
  if (!startsAt) return fail("Tidspunktet kunne ikke læses.");
  const teamIds = await chosenClubTeams(club.id, formData);
  if (!teamIds) return fail("Vælg de hold, aktiviteten skal ud til.");
  const data = { title: form.fields.title, startsAt, location: form.fields.location, note: form.fields.note };

  const id = field(formData, "id");
  if (id) {
    const existing = await prisma.match.findFirst({
      where: { id, clubId: club.id },
      select: { id: true, startsAt: true, cancelledAt: true, teams: { select: { teamId: true } } },
    });
    if (!existing) return fail("Aktiviteten findes ikke længere.");
    const before = existing.teams.map((t) => t.teamId);
    const added = teamIds.filter((t) => !before.includes(t));
    await unshareActivity(existing.id, before.filter((t) => !teamIds.includes(t)));
    await prisma.$transaction([
      prisma.match.updateMany({ where: { id: existing.id, clubId: club.id }, data }),
      prisma.matchTeam.createMany({ data: added.map((teamId) => ({ matchId: existing.id, teamId })), skipDuplicates: true }),
    ]);
    if (existing.startsAt.getTime() !== startsAt.getTime()) {
      // Each team's own jobs on it keep their distance to the start.
      for (const teamId of teamIds) await moveTaskDeadlines(teamId, existing.id, existing.startsAt, startsAt);
      if (!existing.cancelledAt && startsAt > new Date()) {
        await notifyEverybodyOn(
          teamIds.filter((t) => !added.includes(t)),
          user.id,
          {
            category: "ACTIVITIES",
            matchId: existing.id,
            title: "Aktiviteten er flyttet 📅",
            body: `${data.title}: nu ${kickoffLabel(startsAt)} (før ${kickoffLabel(existing.startsAt)}).`,
            url: `/aktiviteter/${existing.id}`,
            tag: `activity-${existing.id}`,
          },
        );
      }
    }
    if (added.length > 0) await tellOfActivity(added, user.id, club.name, { id: existing.id, ...data });
    revalidatePath("/aktiviteter", "layout");
    revalidatePath("/klub");
    return ok();
  }

  const activity = await prisma.match.create({
    data: { ...data, clubId: club.id, kind: "OTHER", source: "MANUAL", teams: { create: teamIds.map((teamId) => ({ teamId })) } },
    select: { id: true },
  });
  await tellOfActivity(teamIds, user.id, club.name, { id: activity.id, ...data });
  revalidatePath("/aktiviteter", "layout");
  revalidatePath("/klub");
  redirect(`/aktiviteter/${activity.id}`);
}

async function tellOfActivity(teamIds: string[], actorId: string, clubName: string, activity: { id: string; title: string; startsAt: Date }) {
  await notifyEverybodyOn(teamIds, actorId, {
    category: "ACTIVITIES",
    matchId: activity.id,
    title: `Ny klubaktivitet fra ${clubName} 📅`,
    body: `${activity.title} · ${kickoffLabel(activity.startsAt)}`,
    url: `/aktiviteter/${activity.id}`,
    tag: `activity-${activity.id}`,
  });
}

/** Deletes a club activity from every team, with its sign-ups, comments and the teams' jobs on it. */
export async function deleteClubActivity(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { club } = await clubInCharge();
  const deleted = await prisma.match.deleteMany({ where: { id: field(formData, "id"), clubId: club.id } });
  if (deleted.count === 0) return ok();
  revalidatePath("/aktiviteter", "layout");
  revalidatePath("/klub");
  redirect("/klub");
}
