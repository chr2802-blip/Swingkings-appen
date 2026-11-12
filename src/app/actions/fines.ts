"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { requireTeamUser } from "@/lib/auth";
import { assertFineManager, canDeleteFine, canManageFines } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { optionalId, optionalText, readForm, requiredText, wholeNumber } from "@/lib/form";
import { canMove } from "@/lib/challenges";
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
  // Anybody on the team may give a fine; taking one back is `deleteFine`'s question.
  const user = await requireTeamUser();
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

/**
 * Takes a fine back. A fine from a challenge takes the whole challenge with it — the
 * loser's fine and the winner's, so no fines appear or vanish — and the challenge is
 * marked withdrawn.
 */
export async function deleteFine(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  const id = String(formData.get("id") ?? "");
  const db = teamDb(user.teamId);
  const fine = await db.fine.findFirst({ where: { id }, select: { challengeId: true, issuedById: true } });
  if (!fine) return ok();
  if (!canDeleteFine(user, user.teamId, fine)) return fail("Kun den der gav bøden, bødekasseformanden eller en admin kan slette den.");
  if (fine.challengeId) {
    await prisma.$transaction([
      db.fine.deleteMany({ where: { challengeId: fine.challengeId } }),
      db.challenge.updateMany({ where: { id: fine.challengeId }, data: { status: "CANCELLED" } }),
    ]);
  } else {
    await db.fine.deleteMany({ where: { id } });
  }
  refresh();
  return ok();
}

/* ── Nulstilling ────────────────────────────────────────────────────────────────── */

/**
 * The bødekasseformand resets (nulstiller) somebody — or, with `playerId` "alle", the
 * whole team: every outstanding fine is marked cleared. Nothing is deleted, so the
 * history still shows what was given.
 */
export async function resetFines(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireTeamUser();
  assertFineManager(user, user.teamId);
  const playerId = String(formData.get("playerId") ?? "");
  if (!playerId) return fail("Vælg hvem der skal nulstilles.");
  const db = teamDb(user.teamId);
  const everybody = playerId === "alle";
  const cleared = await db.fine.updateMany({
    where: { clearedAt: null, ...(everybody ? {} : { playerId }) },
    data: { clearedAt: new Date() },
  });
  if (cleared.count === 0) return fail(everybody ? "Ingen har udestående bøder." : "Der er intet at nulstille.");
  if (!everybody) {
    notifyLater([playerId], user.id, { title: "Din bødekonto er nulstillet 🧽", body: `${user.name} har nulstillet dine bøder.`, url: "/boder", tag: "fine" });
  }
  refresh();
  return ok(everybody ? "Hele holdet er nulstillet." : "Bøderne er nulstillet.");
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
  const open = await db.fine.aggregate({ where: { playerId: winnerId, clearedAt: null }, _sum: { units: true } });
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
    url: "/boder/udfordringer",
    tag: "challenge",
  });
  refresh();
  return ok("Udfordringen venter på godkendelse.");
}

/**
 * Approving or withdrawing a challenge goes through here and through `canMove`, so the
 * rules in `src/lib/challenges.ts` are the only rules. Each write is guarded on the
 * status, so two presses at once cannot both win.
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
    await db.challenge.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
  } else {
    const result = await settleChallenge(id, user.id);
    if (!result.ok) return fail(result.error);
    notifyLater([challenge.winnerId, challenge.loserId, challenge.reportedById], user.id, {
      title: "Udfordringen er godkendt 🏆",
      body: `${challenge.winner.name} sendte ${fineUnits(result.units)} videre til ${challenge.loser.name}: ${challenge.description}`,
      url: "/boder/udfordringer",
    });
  }
  refresh();
  return ok();
}
