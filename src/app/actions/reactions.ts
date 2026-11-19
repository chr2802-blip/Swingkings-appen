"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { readForm } from "@/lib/form";
import { REACTION_KINDS, REACTION_TARGETS, type ReactionTarget } from "@/lib/reactions";
import { announce } from "@/lib/realtime";
import { CHAT_POSTED, FEED_CHANGED } from "@/lib/realtime-topic";
import { activitiesSeenBy, announceTo, postsSeenBy, teamsOf } from "@/lib/club-reach";

const schema = z.object({
  target: z.enum(REACTION_TARGETS, { message: "Det kan man ikke reagere på." }),
  id: z.string().trim().min(1, "Det findes ikke længere."),
  kind: z.enum(REACTION_KINDS, { message: "Den reaktion findes ikke." }),
  /** Which way: "on" to make it the viewer's reaction, "off" to take it back — so a double press ends where it was meant. */
  on: z.enum(["on", "off"]),
});

/** The column a reaction on each kind of thing is written in. */
const COLUMN = {
  post: "postId",
  comment: "postCommentId",
  chat: "chatMessageId",
  activityComment: "activityCommentId",
} as const satisfies Record<ReactionTarget, string>;

/**
 * The thing being reacted to, found within the viewer's reach — the team's own things, and
 * a club post or club activity shown to it; another team's own id is "not found" — with the
 * page to draw anew and the teams to tell.
 */
async function findTarget(
  teamId: string,
  target: ReactionTarget,
  id: string,
): Promise<{ path: string | null; teamIds: string[] } | null> {
  const db = teamDb(teamId);
  const shared = { teamId: true, teams: { select: { teamId: true } } } as const;
  switch (target) {
    case "post": {
      const post = await prisma.post.findFirst({ where: { AND: [{ id }, postsSeenBy(teamId)] }, select: shared });
      return post ? { path: "/oversigt", teamIds: teamsOf(post) } : null;
    }
    case "comment": {
      // A comment has no team of its own; it is within reach when its post is.
      const comment = await prisma.postComment.findFirst({ where: { id, post: postsSeenBy(teamId) }, select: { post: { select: shared } } });
      return comment ? { path: "/oversigt", teamIds: teamsOf(comment.post) } : null;
    }
    case "chat":
      // The chat fetches its messages itself; it is told to by the team's signal.
      return (await db.chatMessage.count({ where: { id } })) ? { path: null, teamIds: [teamId] } : null;
    case "activityComment": {
      // On a club activity every team it is shared with comments together.
      const comment = await prisma.activityComment.findFirst({ where: { id, match: activitiesSeenBy(teamId) }, select: { matchId: true } });
      return comment ? { path: `/aktiviteter/${comment.matchId}`, teamIds: [teamId] } : null;
    }
  }
}

/**
 * Choosing (`on`) a reaction on a post, a comment, a chat message or an activity comment —
 * in place of the one the viewer had there — or taking it back (`off`). Everybody on the
 * team may react to anything of the team's; each person has one reaction on a thing.
 */
export async function react(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const form = readForm(schema, formData);
  if (!form.ok) return fail(form.error);
  const { target, id, kind, on } = form.fields;
  const found = await findTarget(user.teamId, target, id);
  if (!found) return fail("Det findes ikke længere.");

  const column = COLUMN[target];
  if (on === "on") {
    // One statement, held by the unique (thing, person) index: two presses at once — the
    // same reaction or two different ones — leave one row, the last to arrive. Raw SQL
    // for the ON CONFLICT; the thing was found within the viewer's reach just above. The
    // reaction carries the reactor's team, the one on screen.
    await prisma.$executeRaw`
      INSERT INTO "Reaction" ("id", "teamId", "userId", "kind", ${Prisma.raw(`"${column}"`)})
      VALUES (gen_random_uuid()::text, ${user.teamId}, ${user.id}, CAST(${kind} AS "ReactionKind"), ${id})
      ON CONFLICT (${Prisma.raw(`"${column}"`)}, "userId")
      DO UPDATE SET "kind" = EXCLUDED."kind"`;
  } else {
    // Only that reaction: a late "off" for one the viewer has since changed leaves the new one.
    // Their own reaction on it, from whichever team they gave it on.
    await prisma.reaction.deleteMany({ where: { [column]: id, userId: user.id, kind } });
  }

  if (target === "chat") announce(user.teamId, CHAT_POSTED);
  if (target === "post" || target === "comment") announceTo(found.teamIds, FEED_CHANGED);
  if (found.path) revalidatePath(found.path);
  return ok();
}
