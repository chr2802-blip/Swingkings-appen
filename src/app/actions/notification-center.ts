"use server";

import { requireTeamUser } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { field } from "@/lib/form";
import { teamDb } from "@/lib/team-db";
import { markRead } from "@/lib/notifications";
import { mutedFromForm } from "@/lib/notification-categories";

/*
 * The notification center (the bell beside the chat). Everything here is about one's own
 * notifications on the team on screen; another person's, or another team's, is "not found".
 * Nothing is revalidated: the bell asks `/api/notifications` itself.
 */

/** Opening the center: the bell's count starts again from now. What is "ny" stays so until opened. */
export async function markNotificationsSeen(): Promise<ActionResult> {
  const user = await requireTeamUser();
  await teamDb(user.teamId).teamMember.updateMany({ where: { userId: user.id }, data: { notificationsSeenAt: new Date() } });
  return ok();
}

/** One notification opened from the center. */
export async function readNotification(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const id = field(formData, "id");
  if (!id || !(await markRead(user.teamId, user.id, id))) return fail("Notifikationen findes ikke.");
  return ok();
}

/** "Marker alle som læst". */
export async function readAllNotifications(): Promise<ActionResult> {
  const user = await requireTeamUser();
  const now = new Date();
  const db = teamDb(user.teamId);
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: now } });
  await db.teamMember.updateMany({ where: { userId: user.id }, data: { notificationsSeenAt: now } });
  return ok();
}

/**
 * The settings tab: which categories push on this team. Each switch is a checkbox named
 * `on`; what is not ticked is muted. The center shows everything either way.
 */
export async function saveNotificationSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const muted = mutedFromForm(formData);
  if (!muted) return fail("Prøv igen.");
  await teamDb(user.teamId).teamMember.updateMany({ where: { userId: user.id }, data: { mutedPush: muted } });
  return ok("Gemt.");
}
