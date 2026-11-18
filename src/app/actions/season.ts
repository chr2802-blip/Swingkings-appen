"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTeamUser } from "@/lib/auth";
import { assertTeamAdmin } from "@/lib/access";
import { fail, type ActionResult } from "@/lib/action-result";
import { readForm, requiredText } from "@/lib/form";
import { MAX_SEASON_NAME } from "@/lib/season";
import { startSeason } from "@/lib/season-data";
import { notify } from "@/lib/notifications";
import { announce } from "@/lib/realtime";
import { FINES_CHANGED } from "@/lib/realtime-topic";
import { teamDb } from "@/lib/team-db";

const seasonSchema = z.object({
  name: requiredText("Giv sæsonen der slutter et navn.", MAX_SEASON_NAME),
  confirm: z.literal("on", { error: "Sæt flueben for at bekræfte, at det ikke kan fortrydes." }),
});

/**
 * "Start ny sæson" (admin): sums up the season that ends and deletes what it was made
 * of — see `src/lib/season-data.ts` for what goes and what stays. Lands on the summary.
 */
export async function startNewSeason(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(seasonSchema, formData);
  if (!form.ok) return fail(form.error);

  const result = await startSeason(user.teamId, form.fields.name);
  if (!result.ok) return fail(result.error);

  const members = await teamDb(user.teamId).teamMember.findMany({ select: { userId: true } });
  await notify(
    user.teamId,
    members.map((m) => m.userId),
    user.id,
    {
      category: "TEAM",
      title: "Ny sæson ⚽",
      body: `${form.fields.name} er slut. Bødekassen starter forfra.`,
      url: "/hold/saesoner",
      tag: "season",
    },
  );
  // Fines, challenges and the box's payment are gone: open phones read the fine box again.
  announce(user.teamId, FINES_CHANGED);
  revalidatePath("/", "layout");
  redirect("/hold/saesoner");
}
