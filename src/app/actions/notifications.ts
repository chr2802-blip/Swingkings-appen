"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireTeamUser } from "@/lib/auth";
import { assertTeamAdmin } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { readForm, requiredText } from "@/lib/form";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { takeAttempt } from "@/lib/rate-limit";
import { sendPushToUsers } from "@/lib/push";
import {
  MAX_NOTICE_BODY,
  MAX_NOTICE_TITLE,
  NOTICE_DESTINATIONS,
  isPersonal,
  noticeUrl,
  type NoticeDestination,
} from "@/lib/team-notice";

const noticeSchema = z.object({
  to: z.string().min(1, "Vælg hvem der skal have den."),
  title: requiredText("Skriv en overskrift.", MAX_NOTICE_TITLE),
  body: requiredText("Skriv en besked.", MAX_NOTICE_BODY),
  destination: z.enum(NOTICE_DESTINATIONS.map((d) => d.value) as [NoticeDestination, ...NoticeDestination[]], {
    error: "Vælg hvor den skal åbne.",
  }),
  link: z.string().trim().max(2048).optional(),
});

/**
 * "Send notifikation" (admin, `/hold`): a push to one person on the team or to everybody
 * but the sender, opening the page or link the admin picked. Nothing is stored; the push
 * goes after the response, like every other. Eight in a quarter of an hour per sender
 * (`takeAttempt("notice")`), so a slip of the finger cannot buzz the team all evening.
 */
export async function sendTeamNotice(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const form = readForm(noticeSchema, formData);
  if (!form.ok) return fail(form.error);
  const { to, title, body, destination, link } = form.fields;

  const everybody = to === "alle";
  const members = await teamDb(user.teamId).teamMember.findMany({
    where: everybody ? { userId: { not: user.id } } : { userId: to },
    select: { user: { select: { id: true, name: true } } },
  });
  if (members.length === 0) return fail(everybody ? "Der er ingen andre på holdet endnu." : "Personen er ikke på holdet.");

  const team = await prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { mobilePayLink: true, duesKr: true } });
  const recipients = members.map((m) => ({ ...m.user, url: noticeUrl(destination, { recipient: m.user, team, link }) }));
  if (recipients.some((r) => !r.url)) {
    return fail(
      destination === "mobilepay-kontingent"
        ? "Holdet har ikke et MobilePay-link endnu. Sæt det ind under holdets indstillinger."
        : "Linket skal være en hel adresse, der starter med https://",
    );
  }

  // Who can be reached at all: a push only arrives where somebody has turned them on.
  const reachable = new Set(
    (
      await prisma.pushSubscription.findMany({
        where: { userId: { in: recipients.map((r) => r.id) } },
        select: { userId: true },
        distinct: ["userId"],
      })
    ).map((row) => row.userId),
  );
  if (reachable.size === 0) {
    return fail(everybody ? "Ingen på holdet har slået notifikationer til endnu." : "Personen har ikke slået notifikationer til.");
  }
  const limit = await takeAttempt("notice", user.id);
  if (!limit.allowed) return fail(`Du har sendt mange på kort tid. Prøv igen om ${limit.retryAfterMinutes} min.`);

  const targets = recipients.filter((r) => reachable.has(r.id));
  const batches = isPersonal(destination)
    ? targets.map((r) => ({ ids: [r.id], url: r.url! }))
    : [{ ids: targets.map((r) => r.id), url: targets[0]!.url! }];
  after(() =>
    Promise.all(batches.map((batch) => sendPushToUsers(batch.ids, { title, body, url: batch.url }))).catch((error) =>
      console.error(JSON.stringify({ event: "push_failed", error: String(error) })),
    ),
  );

  const missing = recipients.length - targets.length;
  if (!everybody) return ok(`Sendt til ${targets[0]!.name}.`);
  return ok(
    `Sendt til ${targets.length} ${targets.length === 1 ? "person" : "personer"}.` +
      (missing ? ` ${missing} har ikke slået notifikationer til.` : ""),
  );
}
