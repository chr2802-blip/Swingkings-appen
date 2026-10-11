"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { assertFineManager, canManageFines } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { optionalId, optionalText, readForm, requiredText, wholeNumber } from "@/lib/form";
import { canMove, type ChallengeMove } from "@/lib/challenges";
import { settleChallenge } from "@/lib/fines";
import { fineUnits, kr } from "@/lib/money";
import { notifyLater } from "@/lib/notify";

function refresh() {
  revalidatePath("/boder", "layout");
  revalidatePath("/oversigt");
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
  const id = String(formData.get("id") ?? "");
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
  const id = String(formData.get("id") ?? "");
  const db = teamDb(user.teamId);
  const used = await db.fine.count({ where: { fineTypeId: id } });
  if (used > 0) await db.fineType.updateMany({ where: { id }, data: { archivedAt: new Date() } });
  else await db.fineType.deleteMany({ where: { id } });
  refresh();
  return ok();
}

/* ── Giving fines ───────────────────────────────────────────────────────────────── */

const fineSchema = z.object({
  playerIds: z.string().min(1, "Vælg mindst én spiller."),
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
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  const playerIds = [...new Set(formData.getAll("playerId").map(String).filter(Boolean))];
  const form = readForm(fineSchema, (() => {
    const data = new FormData();
    for (const [key, value] of formData) if (key !== "playerId") data.set(key, value);
    data.set("playerIds", playerIds.join(","));
    return data;
  })());
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

export async function deleteFine(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  const id = String(formData.get("id") ?? "");
  const db = teamDb(user.teamId);
  const fine = await db.fine.findFirst({ where: { id }, select: { challengeId: true } });
  if (!fine) return ok();
  await db.fine.deleteMany({ where: { id } });
  // A fine that settled a challenge takes the settlement with it, so the challenge is
  // open again to be settled properly rather than marked won by nobody.
  if (fine.challengeId) {
    await db.challenge.updateMany({
      where: { id: fine.challengeId },
      data: { status: "ACCEPTED", winnerId: null, settledAt: null },
    });
  }
  refresh();
  return ok();
}

/* ── Payments ───────────────────────────────────────────────────────────────────── */

const paymentSchema = z.object({
  playerId: z.string().min(1, "Vælg hvem der har betalt."),
  amountKr: wholeNumber("Beløbet skal være et helt antal kroner (1–100.000).", 1, 100_000),
  note: optionalText,
});

export async function recordPayment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  const form = readForm(paymentSchema, formData);
  if (!form.ok) return fail(form.error);
  const db = teamDb(user.teamId);
  // Somebody who has left can still pay off what they owe, so this asks the ledger too.
  const known =
    (await db.teamMember.count({ where: { userId: form.fields.playerId } })) +
    (await db.fine.count({ where: { playerId: form.fields.playerId } }));
  if (known === 0) return fail("Spilleren findes ikke på holdet.");
  await db.payment.create({ data: { ...form.fields, teamId: user.teamId, recordedById: user.id } });
  refresh();
  return ok(`${kr(form.fields.amountKr)} er registreret.`);
}

export async function deletePayment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  await teamDb(user.teamId).payment.deleteMany({ where: { id: String(formData.get("id") ?? "") } });
  refresh();
  return ok();
}

/* ── Challenges ─────────────────────────────────────────────────────────────────── */

const challengeSchema = z.object({
  opponentId: z.string().min(1, "Vælg hvem du udfordrer."),
  description: requiredText("Skriv hvad udfordringen går ud på."),
  units: wholeNumber("Indsatsen skal være mellem 1 og 50 bøder.", 1, 50),
  matchId: optionalId,
});

export async function createChallenge(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const form = readForm(challengeSchema, formData);
  if (!form.ok) return fail(form.error);
  if (form.fields.opponentId === user.id) return fail("Du kan ikke udfordre dig selv.");
  const db = teamDb(user.teamId);
  if (!(await db.teamMember.count({ where: { userId: form.fields.opponentId } }))) {
    return fail("Spilleren er ikke på holdet.");
  }
  if (form.fields.matchId && !(await db.match.count({ where: { id: form.fields.matchId } }))) {
    return fail("Kampen findes ikke.");
  }
  await db.challenge.create({ data: { ...form.fields, teamId: user.teamId, challengerId: user.id } });
  notifyLater([form.fields.opponentId], user.id, {
    title: `${user.name} udfordrer dig ⚔️`,
    body: `${form.fields.description} — om ${fineUnits(form.fields.units)}`,
    url: "/boder/udfordringer",
    tag: "challenge",
  });
  refresh();
  return ok("Udfordringen er sendt.");
}

const MOVES = ["accept", "decline", "cancel", "claim", "confirm", "dispute", "settle"] as const;

/**
 * Every move on a challenge goes through here and through `canMove`, so the rules in
 * `src/lib/challenges.ts` are the only rules. Each write is guarded on the status it
 * expects, so two presses at once cannot both win.
 */
export async function moveChallenge(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const parsed = z
    .object({ id: z.string().min(1), move: z.enum(MOVES), winnerId: z.string().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Prøv igen.");
  const { id, move, winnerId } = parsed.data;
  const db = teamDb(user.teamId);
  const challenge = await db.challenge.findFirst({
    where: { id },
    include: { challenger: { select: { name: true } }, opponent: { select: { name: true } } },
  });
  if (!challenge) return fail("Udfordringen findes ikke.");
  const managesFines = canManageFines(user, user.teamId);
  if (!canMove(challenge, move as ChallengeMove, user.id, managesFines)) {
    return fail("Det kan du ikke gøre med udfordringen nu.");
  }
  const other = user.id === challenge.challengerId ? challenge.opponentId : challenge.challengerId;
  const now = new Date();
  const guarded = (status: "PENDING" | "ACCEPTED", data: object) =>
    db.challenge.updateMany({ where: { id, status }, data });

  switch (move) {
    case "accept":
      await guarded("PENDING", { status: "ACCEPTED", respondedAt: now });
      notifyLater([challenge.challengerId], user.id, {
        title: `${user.name} tog imod udfordringen`,
        body: challenge.description,
        url: "/boder/udfordringer",
      });
      break;
    case "decline":
      await guarded("PENDING", { status: "DECLINED", respondedAt: now });
      notifyLater([challenge.challengerId], user.id, {
        title: `${user.name} afviste udfordringen`,
        body: challenge.description,
        url: "/boder/udfordringer",
      });
      break;
    case "cancel":
      await guarded("PENDING", { status: "CANCELLED" });
      break;
    case "claim": {
      if (winnerId !== challenge.challengerId && winnerId !== challenge.opponentId) {
        return fail("Vælg hvem der vandt.");
      }
      const updated = await db.challenge.updateMany({
        where: { id, status: "ACCEPTED", claimedById: null },
        data: { claimedById: user.id, claimedWinnerId: winnerId },
      });
      if (updated.count === 0) return fail("Der er allerede meldt en vinder.");
      notifyLater([other], user.id, {
        title: "Bekræft udfordringen",
        body: `${user.name} melder ${winnerId === challenge.challengerId ? challenge.challenger.name : challenge.opponent.name} som vinder: ${challenge.description}`,
        url: "/boder/udfordringer",
      });
      break;
    }
    case "dispute":
      await guarded("ACCEPTED", { claimedById: null, claimedWinnerId: null });
      notifyLater([other], user.id, {
        title: `${user.name} er uenig om vinderen`,
        body: challenge.description,
        url: "/boder/udfordringer",
      });
      break;
    case "confirm":
    case "settle": {
      const winner = move === "confirm" ? challenge.claimedWinnerId : winnerId;
      if (!winner) return fail("Vælg hvem der vandt.");
      const result = await settleChallenge(id, winner, user.id, now);
      if (!result.ok) return fail(result.error);
      notifyLater([challenge.challengerId, challenge.opponentId], user.id, {
        title: "Udfordringen er afgjort 🏆",
        body: `${winner === challenge.challengerId ? challenge.challenger.name : challenge.opponent.name} vandt: ${challenge.description}`,
        url: "/boder/udfordringer",
      });
      break;
    }
  }
  refresh();
  return ok();
}
