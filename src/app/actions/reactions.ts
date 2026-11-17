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
import { CHAT_POSTED } from "@/lib/realtime-topic";

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
 * The thing being reacted to, found within the viewer's team — another team's id is "not
 * found" — with the page to draw anew.
 */
async function findTarget(teamId: string, target: ReactionTarget, id: string): Promise<{ path: string | null } | null> {
  const db = teamDb(teamId);
  switch (target) {
    case "post":
      return (await db.post.count({ where: { id } })) ? { path: "/oversigt" } : null;
    case "comment":
      // A comment has no team of its own; it is the team's when its post is.
      return (await prisma.postComment.count({ where: { id, post: { teamId } } })) ? { path: "/oversigt" } : null;
    case "chat":
      // The chat fetches its messages itself; it is told to by the team's signal.
      return (await db.chatMessage.count({ where: { id } })) ? { path: null } : null;
    case "activityComment": {
      const comment = await db.activityComment.findFirst({ where: { id }, select: { matchId: true } });
      return comment ? { path: `/aktiviteter/${comment.matchId}` } : null;
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
    // for the ON CONFLICT; the thing was found in the viewer's team just above.
    await prisma.$executeRaw`
      INSERT INTO "Reaction" ("id", "teamId", "userId", "kind", ${Prisma.raw(`"${column}"`)})
      VALUES (gen_random_uuid()::text, ${user.teamId}, ${user.id}, CAST(${kind} AS "ReactionKind"), ${id})
      ON CONFLICT (${Prisma.raw(`"${column}"`)}, "userId")
      DO UPDATE SET "kind" = EXCLUDED."kind"`;
  } else {
    // Only that reaction: a late "off" for one the viewer has since changed leaves the new one.
    await teamDb(user.teamId).reaction.deleteMany({ where: { [column]: id, userId: user.id, kind } });
  }

  if (target === "chat") announce(user.teamId, CHAT_POSTED);
  if (found.path) revalidatePath(found.path);
  return ok();
}
