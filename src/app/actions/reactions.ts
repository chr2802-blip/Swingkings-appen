"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
  /** Which way: "on" to give the reaction, "off" to take it back — so a double press ends where it was meant. */
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
 * Giving (`on`) or taking back (`off`) one reaction on a post, a comment, a chat message
 * or an activity comment. Everybody on the team may react to anything of the team's; each
 * person gives each kind once, so giving it twice changes nothing.
 */
export async function react(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const form = readForm(schema, formData);
  if (!form.ok) return fail(form.error);
  const { target, id, kind, on } = form.fields;
  const found = await findTarget(user.teamId, target, id);
  if (!found) return fail("Det findes ikke længere.");

  const db = teamDb(user.teamId);
  const where = { [COLUMN[target]]: id, userId: user.id, kind };
  if (on === "on") {
    // The unique index holds it to once, even when two presses arrive together.
    await db.reaction.createMany({ data: [{ teamId: user.teamId, ...where }], skipDuplicates: true });
  } else {
    await db.reaction.deleteMany({ where });
  }

  if (target === "chat") announce(user.teamId, CHAT_POSTED);
  if (found.path) revalidatePath(found.path);
  return ok();
}
