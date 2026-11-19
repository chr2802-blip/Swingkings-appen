"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { activitiesSeenBy, findActivitySeenBy, notifyAcross, teamsOf } from "@/lib/club-reach";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerClub, canAdministerTeam } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { field } from "@/lib/form";
import { teamRoster } from "@/lib/roster";
import { mentionedIds } from "@/lib/mentions";
import { notify } from "@/lib/notifications";
import { activityName } from "@/lib/activity";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";

const MAX_ACTIVITY_COMMENT = 1000;

/** The activity's page and its tabs, which show the comments' count. */
function refresh(matchId: string) {
  revalidatePath(`/aktiviteter/${matchId}`, "layout");
}

/**
 * A comment on an activity, or an answer to one (`parentId`). Answers sit one level deep,
 * as under a feed post: an answer to an answer goes under the comment that started the
 * thread. Everybody on the team hears of it — whoever is answered, or tagged ("@Bo"), in
 * those words; the rest as a new comment on the activity.
 */
export async function addActivityComment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  // The team's own activity, or a club activity shared with it — where every team it is
  // shared with comments together.
  const match = await findActivitySeenBy(user.teamId, field(formData, "matchId"), {
    id: true,
    title: true,
    opponent: true,
    kind: true,
    teamId: true,
    teams: { select: { teamId: true } },
  });
  if (!match) return fail("Aktiviteten findes ikke.");
  const text = z.string().trim().min(1, "Skriv en kommentar.").max(MAX_ACTIVITY_COMMENT, `Højst ${MAX_ACTIVITY_COMMENT} tegn.`).safeParse(formData.get("body") ?? "");
  if (!text.success) return fail(text.error.issues[0]?.message ?? "Skriv en kommentar.");

  const answering = field(formData, "parentId");
  let replyTo: { id: string; authorId: string; parent: { id: string; authorId: string } | null } | null = null;
  if (answering) {
    // Only a comment on this very activity, which was found within the team's reach above.
    replyTo = await prisma.activityComment.findFirst({
      where: { id: answering, matchId: match.id },
      select: { id: true, authorId: true, parent: { select: { id: true, authorId: true } } },
    });
    if (!replyTo) return fail("Kommentaren findes ikke længere.");
  }
  const thread = replyTo?.parent ?? replyTo;

  // The same limit as the chat: a comment pushes to the whole team.
  const limit = await checkRateLimit("chat", user.id);
  if (!limit.allowed) return fail("Du skriver meget hurtigt. Vent lidt.");
  await recordAttempt("chat", user.id);

  // Filed under the commenter's team: on a club activity, the team they wrote from.
  await prisma.activityComment.create({
    data: { teamId: user.teamId, matchId: match.id, authorId: user.id, body: text.data, parentId: thread?.id ?? null },
  });

  // Each person hears of it once, in the most particular words that fit them: answered,
  // then tagged, then everybody else on the team. Who is tagged is read against this
  // team's roster, so nobody on another team can be.
  const roster = await teamRoster(user.teamId);
  const url = `/aktiviteter/${match.id}`;
  const tag = `activity-comments-${match.id}`;
  const name = activityName(match);
  const preview = text.data.slice(0, 140);
  const answered = replyTo && thread ? [...new Set([replyTo.authorId, thread.authorId])] : [];
  const tagged = mentionedIds(text.data, roster).filter((id) => !answered.includes(id));
  const about = { category: "COMMENTS", url, tag, matchId: match.id } as const;
  // On a club activity the one answered may be on another of its teams: each hears it on their own.
  await notifyAcross(teamsOf(match), answered, user.id, { ...about, title: `${user.name} svarede på din kommentar · ${name}`, body: preview });
  await notify(user.teamId, tagged, user.id, { ...about, title: `${user.name} nævnte dig · ${name}`, body: preview });
  // A club activity is shared with whole clubs of people: only those answered or tagged hear of a comment.
  if (match.teamId) {
    const rest = roster.map((m) => m.userId).filter((id) => !answered.includes(id) && !tagged.includes(id));
    await notify(user.teamId, rest, user.id, { ...about, title: `Ny kommentar · ${name}`, body: `${user.name}: ${preview}` });
  }

  refresh(match.id);
  return ok();
}

/**
 * Deleting a comment on an activity, with its answers: whoever wrote it, or the team's
 * admins. On a club activity a team's admins delete what was written from their team, and
 * the club's admins any of it.
 */
export async function deleteActivityComment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const comment = await prisma.activityComment.findFirst({
    where: { id: field(formData, "id"), match: activitiesSeenBy(user.teamId) },
    select: { id: true, authorId: true, matchId: true, teamId: true, match: { select: { clubId: true } } },
  });
  if (!comment) return ok();
  const mayTidy =
    (comment.teamId === user.teamId && canAdministerTeam(user, user.teamId)) || canAdministerClub(user, comment.match.clubId);
  if (comment.authorId !== user.id && !mayTidy) return fail("Det er ikke din kommentar.");
  await prisma.activityComment.deleteMany({ where: { id: comment.id } });
  refresh(comment.matchId);
  return ok();
}
