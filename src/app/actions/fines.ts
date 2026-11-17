"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { assertFineManager, assertTeamAdmin, canDeleteFine, canManageFines } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { field, optionalId, optionalText, readForm, requiredText, wholeNumber } from "@/lib/form";
import { canMove } from "@/lib/challenges";
import { PAYMENT_OPEN, settleChallenge } from "@/lib/fines";
import { balances, fineUnits, kr } from "@/lib/money";
import { notifyLater } from "@/lib/notify";

function refresh() {
  revalidatePath("/boder", "layout");
  revalidatePath("/oversigt");
  revalidatePath("/hold", "layout");
  revalidatePath("/spiller", "layout");
}

/** Whether an admin has opened the box for payment: then what each player owes stands still. */
async function paymentOpen(teamId: string) {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { finePaymentOpenedAt: true } });
  return team.finePaymentOpenedAt !== null;
}

/* ── The catalogue ─────────────────────────────────────────────────────────────── */

const fineTypeSchema = z.object({
  name: requiredText("Giv bøden et navn."),
  description: optionalText,
  units: wholeNumber("Antal bøder skal være et helt tal mellem 1 og 100.", 1, 100),
});

export async function saveFineType(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  const form = readForm(fineTypeSchema, formData);
  if (!form.ok) return fail(form.error);
  const db = teamDb(user.teamId);
  const id = field(formData, "id");
  if (id) {
    const updated = await db.fineType.updateMany({ where: { id }, data: form.fields });
    if (updated.count === 0) return fail("Bøden findes ikke længere.");
  } else {
    await db.fineType.create({ data: { ...form.fields, teamId: user.teamId } });
  }
  refresh();
  return ok();
}

/**
 * Takes a type out of the catalogue. One that has been given keeps its row (archived)
 * so the history can still say what it was; one never used is simply deleted.
 */
export async function removeFineType(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  const id = field(formData, "id");
  const db = teamDb(user.teamId);
  const used = await db.fine.count({ where: { fineTypeId: id } });
  if (used > 0) await db.fineType.updateMany({ where: { id }, data: { archivedAt: new Date() } });
  else await db.fineType.deleteMany({ where: { id } });
  refresh();
  return ok();
}

/* ── Giving fines ───────────────────────────────────────────────────────────────── */

const fineSchema = z.object({
  fineTypeId: optionalId,
  reason: z.string().trim().max(200).optional(),
  units: z.string().trim().optional(),
  note: optionalText,
  matchId: optionalId,
});

/**
 * Gives one fine to one or more players at once — the whole back four were late. Either
 * from the catalogue (its name and number of fines, unless overridden) or written freely.
 */
export async function giveFine(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // Anybody on the team may give a fine; taking one back is `deleteFine`'s question.
  const user = await requireTeamUser();
  if (await paymentOpen(user.teamId)) return fail(PAYMENT_OPEN);
  const playerIds = [...new Set(formData.getAll("playerId").map(String).filter(Boolean))];
  if (playerIds.length === 0) return fail("Vælg mindst én spiller.");
  const form = readForm(fineSchema, formData);
  if (!form.ok) return fail(form.error);
  const db = teamDb(user.teamId);

  const members = await db.teamMember.findMany({ where: { userId: { in: playerIds } }, select: { userId: true } });
  if (members.length !== playerIds.length) return fail("En af spillerne er ikke på holdet.");

  let reason = form.fields.reason ?? "";
  // Written freely with no number, a fine is one fine.
  let units = form.fields.units ? Number(form.fields.units) : 1;
  let fineTypeId: string | null = null;
  if (form.fields.fineTypeId) {
    const type = await db.fineType.findFirst({ where: { id: form.fields.fineTypeId, archivedAt: null } });
    if (!type) return fail("Bøden findes ikke i kataloget længere.");
    fineTypeId = type.id;
    reason ||= type.name;
    if (!form.fields.units) units = type.units;
  }
  if (!reason) return fail("Vælg en bøde fra kataloget eller skriv hvad den er for.");
  if (!Number.isInteger(units) || units < 1 || units > 100) return fail("Antal bøder skal være et helt tal mellem 1 og 100.");

  if (form.fields.matchId && !(await db.match.findFirst({ where: { id: form.fields.matchId }, select: { id: true } }))) {
    return fail("Kampen findes ikke.");
  }

  const team = await prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { finePriceKr: true } });
  await db.fine.createMany({
    data: playerIds.map((playerId) => ({
      teamId: user.teamId,
      playerId,
      fineTypeId,
      reason,
      units,
      unitPriceKr: team.finePriceKr,
      note: form.fields.note,
      matchId: form.fields.matchId,
      issuedById: user.id,
    })),
  });
  notifyLater(playerIds, user.id, {
    title: "Du har fået en bøde 💸",
    body: `${reason} — ${fineUnits(units)} (${kr(units * team.finePriceKr)})`,
    url: "/boder",
    tag: "fine",
  });
  refresh();
  return ok(playerIds.length > 1 ? `${playerIds.length} bøder er givet.` : "Bøden er givet.");
}

/**
 * Takes a fine back. A fine from a challenge takes the whole challenge with it — the
 * loser's fine, the winner's and the challenge itself, so no fines appear or vanish and
 * the withdrawn challenge is shown nowhere.
 */
export async function deleteFine(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const id = field(formData, "id");
  const db = teamDb(user.teamId);
  const fine = await db.fine.findFirst({ where: { id }, select: { challengeId: true, issuedById: true } });
  if (!fine) return ok();
  if (!canDeleteFine(user, user.teamId, fine)) return fail("Kun den der gav bøden, bødekasseformanden eller en admin kan slette den.");
  if (fine.challengeId) {
    await prisma.$transaction([
      db.fine.deleteMany({ where: { challengeId: fine.challengeId } }),
      db.challenge.deleteMany({ where: { id: fine.challengeId } }),
    ]);
  } else {
    await db.fine.deleteMany({ where: { id } });
  }
  refresh();
  return ok();
}

/* ── Paying ─────────────────────────────────────────────────────────────────────── */

/**
 * "Åbn for betaling" (admin, team settings): the season is over and the box is paid. While
 * it is open, "Betal" shows and nobody can give fines or report or approve challenges, so
 * what each player owes stands still. Everybody who owes something is told how much.
 *
 * Closing it again ("open" anything but "1") is for a mistake, and only while nobody has
 * been marked paid: after that a new fine could leave somebody between paid and owing.
 * A new season closes it (`startSeason`).
 */
export async function setFinePayment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertTeamAdmin(user, user.teamId);
  const open = field(formData, "open") === "1";
  const db = teamDb(user.teamId);
  if (open) {
    // Guarded on its being closed, so a double press tells the team once.
    const opened = await prisma.team.updateMany({
      where: { id: user.teamId, finePaymentOpenedAt: null },
      data: { finePaymentOpenedAt: new Date() },
    });
    if (opened.count === 0) return fail("Bødekassen er allerede åben for betaling.");
    const [fines, members] = await Promise.all([
      db.fine.findMany({ select: { playerId: true, units: true, unitPriceKr: true } }),
      db.teamMember.findMany({ select: { userId: true } }),
    ]);
    for (const row of balances(members.map((m) => m.userId), fines)) {
      if (row.owesKr === 0 || !members.some((m) => m.userId === row.userId)) continue;
      notifyLater([row.userId], user.id, {
        title: "Betal dine bøder 💸",
        body: `Bødekassen er åben for betaling. Du skal betale ${kr(row.owesKr)}.`,
        url: `/spiller/${row.userId}`,
        tag: "fine-payment",
      });
    }
    refresh();
    return ok("Bødekassen er åben for betaling.");
  }
  if (await db.teamMember.count({ where: { finesPaidAt: { not: null } } })) {
    return fail("Nogen er allerede markeret som betalt. Bødekassen lukker, når den nye sæson starter.");
  }
  await prisma.team.updateMany({ where: { id: user.teamId }, data: { finePaymentOpenedAt: null } });
  refresh();
  return ok("Bødekassen er lukket for betaling igen.");
}

/**
 * The bødekasseformand marks somebody's fines paid ("paid" = "1"), once the money is seen
 * in the box — or takes the mark off again. All or nothing: nothing about the fines
 * themselves changes. Only while the box is open for payment.
 */
export async function markFinesPaid(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  const playerId = field(formData, "playerId");
  const paid = field(formData, "paid") === "1";
  if (!(await paymentOpen(user.teamId))) return fail("Bødekassen er ikke åben for betaling endnu.");
  const updated = await teamDb(user.teamId).teamMember.updateMany({
    where: { userId: playerId },
    data: { finesPaidAt: paid ? new Date() : null },
  });
  if (updated.count === 0) return fail("Spilleren er ikke på holdet.");
  if (paid) {
    notifyLater([playerId], user.id, { title: "Tak for betalingen 🙌", body: `${user.name} har markeret dine bøder som betalt.`, url: "/boder", tag: "fine" });
  }
  refresh();
  return ok(paid ? "Markeret som betalt." : "Ikke længere markeret som betalt.");
}

/* ── Challenges ─────────────────────────────────────────────────────────────────── */

const challengeSchema = z.object({
  opponentId: z.string().min(1, "Vælg hvem du spillede mod."),
  outcome: z.enum(["won", "lost"], { error: "Vælg hvem der vandt." }),
  description: requiredText("Skriv hvad udfordringen gik ud på."),
  units: wholeNumber("Indsatsen skal være mellem 1 og 50 bøder.", 1, 50),
  matchId: optionalId,
});

/**
 * Reports a challenge that has been played: against whom, who won, and how many fines
 * it was for. It goes through when anybody else on the team approves it. The winner
 * must owe at least the stake — a challenge moves fines, it does not make credit.
 */
export async function createChallenge(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  if (await paymentOpen(user.teamId)) return fail(PAYMENT_OPEN);
  const form = readForm(challengeSchema, formData);
  if (!form.ok) return fail(form.error);
  const { opponentId, outcome, description, units, matchId } = form.fields;
  if (opponentId === user.id) return fail("Du kan ikke udfordre dig selv.");
  const db = teamDb(user.teamId);
  const opponent = await db.teamMember.findFirst({ where: { userId: opponentId }, select: { user: { select: { name: true } } } });
  if (!opponent) return fail("Spilleren er ikke på holdet.");
  if (matchId && !(await db.match.count({ where: { id: matchId } }))) return fail("Kampen findes ikke.");

  const winnerId = outcome === "won" ? user.id : opponentId;
  const loserId = outcome === "won" ? opponentId : user.id;
  const open = await db.fine.aggregate({ where: { playerId: winnerId }, _sum: { units: true } });
  const owed = Math.max(0, open._sum.units ?? 0);
  const winnerName = outcome === "won" ? "Du" : opponent.user.name;
  if (owed === 0) return fail(`${winnerName} har ingen bøder at udfordre sig ud af.`);
  if (units > owed) return fail(`${winnerName} har kun ${fineUnits(owed)} — indsatsen kan højst være det.`);

  await db.challenge.create({
    data: { teamId: user.teamId, reportedById: user.id, winnerId, loserId, description, units, matchId },
  });
  notifyLater([opponentId], user.id, {
    title: "Godkend udfordringen ⚔️",
    body: `${user.name} melder ${outcome === "won" ? `sig selv` : "dig"} som vinder: ${description} — ${fineUnits(units)}`,
    url: "/boder?udfordringer",
    tag: "challenge",
  });
  refresh();
  return ok("Udfordringen venter på godkendelse.");
}

/**
 * Approving or withdrawing a challenge goes through here and through `canMove`, so the
 * rules in `src/lib/challenges.ts` are the only rules. Each write is guarded on the
 * status, so two presses at once cannot both win. A withdrawn challenge is deleted.
 */
export async function moveChallenge(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const parsed = z
    .object({ id: z.string().min(1), move: z.enum(["approve", "cancel"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Prøv igen.");
  const { id, move } = parsed.data;
  const db = teamDb(user.teamId);
  const challenge = await db.challenge.findFirst({
    where: { id },
    include: { winner: { select: { name: true } }, loser: { select: { name: true } } },
  });
  if (!challenge) return fail("Udfordringen findes ikke.");
  if (!canMove(challenge, move, user.id, canManageFines(user, user.teamId))) {
    return fail("Det kan du ikke gøre med udfordringen nu.");
  }

  if (move === "cancel") {
    await db.challenge.deleteMany({ where: { id, status: "PENDING" } });
  } else {
    const result = await settleChallenge(id, user.id);
    if (!result.ok) return fail(result.error);
    notifyLater([challenge.winnerId, challenge.loserId, challenge.reportedById], user.id, {
      title: "Udfordringen er godkendt 🏆",
      body: `${challenge.winner.name} sendte ${fineUnits(result.units)} videre til ${challenge.loser.name}: ${challenge.description}`,
      url: "/boder?udfordringer",
    });
  }
  refresh();
  return ok();
}
