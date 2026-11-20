"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { teamDb } from "@/lib/team-db";
import { findActivitySeenBy } from "@/lib/club-reach";
import { requireTeamUser } from "@/lib/auth";
import { assertFineManager, assertTeamAdmin, canAdministerTeam, canDeleteFine, canManageFines } from "@/lib/access";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { field, optionalId, optionalText, readForm, requiredText, wholeNumber } from "@/lib/form";
import { canMove } from "@/lib/challenges";
import { PAYMENT_OPEN, settleChallenge } from "@/lib/fines";
import { balances, fineUnits, kr } from "@/lib/money";
import { notify, notifyEach } from "@/lib/notifications";
import { announce } from "@/lib/realtime";
import { FINES_CHANGED } from "@/lib/realtime-topic";

/** Draws the pages that show the fine box anew — here, and on every teammate's open phone. */
function refresh(teamId: string) {
  announce(teamId, FINES_CHANGED);
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
  refresh(user.teamId);
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
  refresh(user.teamId);
  return ok();
}

/* ── Giving fines ───────────────────────────────────────────────────────────────── */

const fineSchema = z.object({
  note: optionalText,
  matchId: optionalId,
});

/**
 * Gives one fine to one or more players at once — the whole back four were late — or
 * several fines from the catalogue to each of them (late *and* forgot the shin pads). Always
 * from the catalogue: its name and its number of fines, never written freely or priced
 * by whoever gives it. A `reason` or `units` in the form is not read.
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

  // One fine from the catalogue, or several at once (a player's page): each to every player.
  const typeIds = [...new Set(formData.getAll("fineTypeId").map(String).filter(Boolean))];
  if (typeIds.length === 0) return fail("Vælg en bøde fra kataloget.");
  const found = await db.fineType.findMany({ where: { id: { in: typeIds }, archivedAt: null } });
  if (found.length !== typeIds.length) return fail("Bøden findes ikke i kataloget længere.");
  // In the order they were chosen, so the history reads as the giver picked them.
  const types = typeIds.map((id) => found.find((type) => type.id === id)!);

  if (form.fields.matchId && !(await findActivitySeenBy(user.teamId, form.fields.matchId, { id: true }))) {
    return fail("Kampen findes ikke.");
  }

  const team = await prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { finePriceKr: true } });
  const fines = await db.fine.createManyAndReturn({
    data: playerIds.flatMap((playerId) =>
      types.map((type) => ({
        teamId: user.teamId,
        playerId,
        fineTypeId: type.id,
        reason: type.name,
        units: type.units,
        unitPriceKr: team.finePriceKr,
        note: form.fields.note,
        matchId: form.fields.matchId,
        issuedById: user.id,
      })),
    ),
  });
  await notifyEach(
    user.teamId,
    user.id,
    // One notice per player (`notifyEach` takes one per person), naming every fine they got;
    // it is linked to the first of them.
    playerIds.map((playerId) => {
      const theirs = fines.filter((fine) => fine.playerId === playerId);
      const units = theirs.reduce((sum, fine) => sum + fine.units, 0);
      return {
        userId: playerId,
        category: "FINES" as const,
        title: theirs.length > 1 ? `Du har fået ${theirs.length} bøder 💸` : "Du har fået en bøde 💸",
        body: `${theirs.map((fine) => fine.reason).join(", ")} — ${fineUnits(units)} (${kr(units * team.finePriceKr)})`,
        url: "/boder",
        tag: "fine",
        fineId: theirs[0]!.id,
      };
    }),
  );
  refresh(user.teamId);
  return ok(
    fines.length > 1 ? `${fines.length} bøder er givet.` : "Bøden er givet.",
    fines.map((fine) => fine.id),
  );
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
  refresh(user.teamId);
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
    await notifyEach(
      user.teamId,
      user.id,
      balances(members.map((m) => m.userId), fines)
        .filter((row) => row.owesKr > 0 && members.some((m) => m.userId === row.userId))
        .map((row) => ({
          userId: row.userId,
          category: "FINES" as const,
          title: "Betal dine bøder 💸",
          body: `Bødekassen er åben for betaling. Du skal betale ${kr(row.owesKr)}.`,
          url: `/spiller/${row.userId}`,
          tag: "fine-payment",
          // The season's money waits on it, so it is pushed whatever the settings say.
          always: true,
        })),
    );
    refresh(user.teamId);
    return ok("Bødekassen er åben for betaling.");
  }
  if (await db.teamMember.count({ where: { finesPaidAt: { not: null } } })) {
    return fail("Nogen er allerede markeret som betalt. Bødekassen lukker, når den nye sæson starter.");
  }
  await prisma.team.updateMany({ where: { id: user.teamId }, data: { finePaymentOpenedAt: null } });
  refresh(user.teamId);
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
    await notify(user.teamId, [playerId], user.id, {
      category: "FINES",
      title: "Tak for betalingen 🙌",
      body: `${user.name} har markeret dine bøder som betalt.`,
      url: "/boder",
      tag: "fine",
    });
  }
  refresh(user.teamId);
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
  if (matchId && !(await findActivitySeenBy(user.teamId, matchId, { id: true }))) return fail("Kampen findes ikke.");

  const winnerId = outcome === "won" ? user.id : opponentId;
  const loserId = outcome === "won" ? opponentId : user.id;
  const open = await db.fine.aggregate({ where: { playerId: winnerId }, _sum: { units: true } });
  const owed = Math.max(0, open._sum.units ?? 0);
  const winnerName = outcome === "won" ? "Du" : opponent.user.name;
  if (owed === 0) return fail(`${winnerName} har ingen bøder at udfordre sig ud af.`);
  if (units > owed) return fail(`${winnerName} har kun ${fineUnits(owed)} — indsatsen kan højst være det.`);

  const challenge = await db.challenge.create({
    data: { teamId: user.teamId, reportedById: user.id, winnerId, loserId, description, units, matchId },
  });
  await notify(user.teamId, [opponentId], user.id, {
    category: "CHALLENGES",
    challengeId: challenge.id,
    title: "Godkend udfordringen ⚔️",
    body: `${user.name} melder ${outcome === "won" ? `sig selv` : "dig"} som vinder: ${description} — ${fineUnits(units)}`,
    url: "/boder/historik",
    tag: "challenge",
  });
  refresh(user.teamId);
  return ok("Udfordringen venter på godkendelse.", [challenge.id]);
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
  const rights = { managesFines: canManageFines(user, user.teamId), administers: canAdministerTeam(user, user.teamId) };
  if (!canMove(challenge, move, user.id, rights)) {
    return fail("Det kan du ikke gøre med udfordringen nu.");
  }

  if (move === "cancel") {
    await db.challenge.deleteMany({ where: { id, status: "PENDING" } });
  } else {
    const result = await settleChallenge(id, user.id, new Date(), { ownAllowed: rights.administers });
    if (!result.ok) return fail(result.error);
    await notify(user.teamId, [challenge.winnerId, challenge.loserId, challenge.reportedById], user.id, {
      category: "CHALLENGES",
      challengeId: challenge.id,
      title: "Udfordringen er godkendt 🏆",
      body: `${challenge.winner.name} sendte ${fineUnits(result.units)} videre til ${challenge.loser.name}: ${challenge.description}`,
      url: "/boder/historik",
    });
  }
  refresh(user.teamId);
  // Approved, the challenge's id finds the two fines it moved (each row carries it).
  return move === "approve" ? ok(undefined, [id]) : ok();
}
