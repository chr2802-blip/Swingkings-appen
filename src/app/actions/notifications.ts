"use server";

import { z } from "zod";
import { requireTeamUser } from "@/lib/auth";
import { assertTeamAdmin } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { readForm, requiredText } from "@/lib/form";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { takeAttempt } from "@/lib/rate-limit";
import { notifyEach } from "@/lib/notifications";
import {
  MAX_NOTICE_BODY,
  MAX_NOTICE_TITLE,
  NOTICE_DESTINATIONS,
  noticeUrl,
  type NoticeDestination,
} from "@/lib/team-notice";

const noticeSchema = z.object({
  to: z.enum(["alle", "valgte"], { error: "Vælg hvem der skal have den." }),
  title: requiredText("Skriv en overskrift.", MAX_NOTICE_TITLE),
  body: requiredText("Skriv en besked.", MAX_NOTICE_BODY),
  destination: z.enum(NOTICE_DESTINATIONS.map((d) => d.value) as [NoticeDestination, ...NoticeDestination[]], {
    error: "Vælg hvor den skal åbne.",
  }),
  link: z.string().trim().max(2048).optional(),
});

/**
 * "Send notifikation" (admin, `/hold`): a push to everybody on the team but the sender
 * (`to=alle`), or to the players ticked (`to=valgte`, repeated `recipientId`), opening the page or link the admin picked.
 * Everybody finds it in the notification center; those with notifications on get a push
 * too, after the response, and it cannot be muted. Eight in a quarter of an hour per sender
 * (`takeAttempt("notice")`), so a slip of the finger cannot buzz the team all evening.
 */
export async function sendTeamNotice(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(noticeSchema, formData);
  if (!form.ok) return fail(form.error);
  const { to, title, body, destination, link } = form.fields;

  const everybody = to === "alle";
  const picked = everybody ? [] : [...new Set(formData.getAll("recipientId").map(String).filter(Boolean))];
  if (!everybody && picked.length === 0) return fail("Vælg mindst én spiller.");
  const members = await teamDb(user.teamId).teamMember.findMany({
    where: everybody ? { userId: { not: user.id } } : { userId: { in: picked } },
    select: { user: { select: { id: true, name: true } } },
  });
  if (everybody && members.length === 0) return fail("Der er ingen andre på holdet endnu.");
  // Somebody on another team (or gone) reads as not found, and nothing is sent to the rest.
  if (!everybody && members.length < picked.length) {
    return fail(picked.length === 1 ? "Personen er ikke på holdet." : "En af de valgte er ikke på holdet.");
  }
  const one = !everybody && picked.length === 1;

  const team = await prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { mobilePayLink: true, duesKr: true } });
  const recipients = members.map((m) => ({ ...m.user, url: noticeUrl(destination, { recipient: m.user, team, link }) }));
  if (recipients.some((r) => !r.url)) {
    return fail(
      destination === "mobilepay-kontingent"
        ? "Holdet har ikke et MobilePay-link endnu. Sæt det ind under holdets indstillinger."
        : "Linket skal være en hel adresse, der starter med https://",
    );
  }

  const limit = await takeAttempt("notice", user.id);
  if (!limit.allowed) return fail(`Du har sendt mange på kort tid. Prøv igen om ${limit.retryAfterMinutes} min.`);

  // Everybody gets it under the bell; a push only arrives where somebody has turned them on.
  // No actor left out: an admin may tick themselves, to see how it looks.
  await notifyEach(
    user.teamId,
    null,
    recipients.map((r) => ({ userId: r.id, category: "TEAM" as const, title, body, url: r.url! })),
  );
  const reachable = new Set(
    (
      await prisma.pushSubscription.findMany({
        where: { userId: { in: recipients.map((r) => r.id) } },
        select: { userId: true },
        distinct: ["userId"],
      })
    ).map((row) => row.userId),
  );

  const missing = recipients.filter((r) => !reachable.has(r.id)).length;
  if (one) return ok(`Sendt til ${recipients[0]!.name}.` + (missing ? " Personen har ikke slået notifikationer til og ser den under klokken." : ""));
  return ok(
    `Sendt til ${recipients.length} ${recipients.length === 1 ? "person" : "personer"}.` +
      (missing ? ` ${missing} har ikke slået notifikationer til og ser den kun under klokken.` : ""),
  );
}
