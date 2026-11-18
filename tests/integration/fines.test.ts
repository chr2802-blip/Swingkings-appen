import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createChallenge,
  deleteFine,
  giveFine,
  moveChallenge,
  markFinesPaid,
  removeFineType,
  saveFineType,
  setFinePayment,
} from "@/app/actions/fines";
import { fineBoard, fineHistory, matchOptions, monthKings } from "@/lib/fine-data";
import { formData, makeMatch, makeMember, makeSquad, signIn } from "../helpers/factories";
import { expectDenied, expectRedirectToLogin } from "../helpers/expect";

describe("the catalogue", () => {
  it("adds and edits a fine type", async () => {
    const { team, treasurer } = await makeSquad();
    await signIn(treasurer);
    expect(await saveFineType(undefined, formData({ name: "For sent", units: "2" }))).toEqual({ ok: true });
    const type = await prisma.fineType.findFirstOrThrow({ where: { teamId: team.id } });
    expect(type).toMatchObject({ name: "For sent", units: 2, description: null });

    await saveFineType(undefined, formData({ id: type.id, name: "For sent til træning", units: "3", description: "Efter fløjt" }));
    expect(await prisma.fineType.findUniqueOrThrow({ where: { id: type.id } })).toMatchObject({
      name: "For sent til træning",
      units: 3,
      description: "Efter fløjt",
    });
  });

  it("refuses a nameless type, units outside 1–100 and another team's type", async () => {
    const { treasurer } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await prisma.fineType.create({ data: { teamId: other.team.id, name: "Deres", units: 1 } });
    await signIn(treasurer);
    expect(await saveFineType(undefined, formData({ name: "", units: "1" }))).toEqual({ ok: false, error: "Giv bøden et navn." });
    expect((await saveFineType(undefined, formData({ name: "X", units: "101" })))?.ok).toBe(false);
    expect(await saveFineType(undefined, formData({ id: theirs.id, name: "Hacket", units: "1" }))).toEqual({
      ok: false,
      error: "Bøden findes ikke længere.",
    });
    expect((await prisma.fineType.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe("Deres");
  });

  it("deletes a type never given, and archives one that has been", async () => {
    const { team, treasurer, anna } = await makeSquad();
    const unused = await prisma.fineType.create({ data: { teamId: team.id, name: "Aldrig", units: 1 } });
    const used = await prisma.fineType.create({ data: { teamId: team.id, name: "Brugt", units: 1 } });
    await prisma.fine.create({
      data: { teamId: team.id, playerId: anna.id, fineTypeId: used.id, reason: "Brugt", units: 1, unitPriceKr: 10, issuedById: treasurer.id },
    });
    await signIn(treasurer);
    await removeFineType(undefined, formData({ id: unused.id }));
    await removeFineType(undefined, formData({ id: used.id }));
    expect(await prisma.fineType.count({ where: { id: unused.id } })).toBe(0);
    expect((await prisma.fineType.findUniqueOrThrow({ where: { id: used.id } })).archivedAt).not.toBeNull();
  });

  it("is the treasurer's and the admin's, not a player's", async () => {
    const { admin, anna } = await makeSquad();
    await signIn(admin);
    expect(await saveFineType(undefined, formData({ name: "Admin", units: "1" }))).toEqual({ ok: true });
    await signIn(anna);
    await expectDenied(() => saveFineType(undefined, formData({ name: "X", units: "1" })));
    await expectDenied(() => removeFineType(undefined, formData({ id: "x" })));
  });
});

describe("giveFine", () => {
  it("gives a catalogue fine to several players at the team's price, copied onto each fine", async () => {
    const { team, treasurer, anna, bo } = await makeSquad("Swingkings", { finePriceKr: 20 });
    const type = await prisma.fineType.create({ data: { teamId: team.id, name: "For sent", units: 2 } });
    await signIn(treasurer);

    const result = await giveFine(undefined, formData({ playerId: [anna.id, bo.id, anna.id], fineTypeId: type.id }));
    expect(result).toEqual({ ok: true, note: "2 bøder er givet." });
    const fines = await prisma.fine.findMany({ where: { teamId: team.id } });
    expect(fines).toHaveLength(2);
    for (const fine of fines) expect(fine).toMatchObject({ reason: "For sent", units: 2, unitPriceKr: 20, fineTypeId: type.id, issuedById: treasurer.id });

    // A later price change never rewrites what is owed.
    await prisma.team.update({ where: { id: team.id }, data: { finePriceKr: 50 } });
    const board = await fineBoard(team.id);
    expect(board.balances.find((b) => b.userId === anna.id)).toMatchObject({ owesKr: 40, units: 2 });
  });

  it("takes the name and the number of fines from the catalogue, never from the form", async () => {
    const { team, treasurer, anna } = await makeSquad();
    const type = await prisma.fineType.create({ data: { teamId: team.id, name: "Rødt kort", units: 10 } });
    const match = await makeMatch(team.id);
    await signIn(treasurer);
    // A form that still carries a reason or a number of its own is not believed.
    const result = await giveFine(
      undefined,
      formData({ playerId: anna.id, fineTypeId: type.id, reason: "Noget andet", units: "1", matchId: match.id, note: "Diskussion" }),
    );
    expect(result).toEqual({ ok: true, note: "Bøden er givet." });
    expect(await prisma.fine.findFirstOrThrow({ where: { playerId: anna.id } })).toMatchObject({
      reason: "Rødt kort",
      units: 10,
      fineTypeId: type.id,
      matchId: match.id,
      note: "Diskussion",
    });
  });

  it("refuses what it cannot give", async () => {
    const { team, treasurer, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const type = await prisma.fineType.create({ data: { teamId: team.id, name: "For sent", units: 1 } });
    const archived = await prisma.fineType.create({ data: { teamId: team.id, name: "Gammel", units: 1, archivedAt: new Date() } });
    const theirType = await prisma.fineType.create({ data: { teamId: other.team.id, name: "Deres", units: 1 } });
    const theirMatch = await makeMatch(other.team.id);
    await signIn(treasurer);
    const give = (fields: Record<string, string | string[]>) => giveFine(undefined, formData(fields));

    expect(await give({ fineTypeId: type.id })).toEqual({ ok: false, error: "Vælg mindst én spiller." });
    expect(await give({ playerId: other.anna.id, fineTypeId: type.id })).toEqual({ ok: false, error: "En af spillerne er ikke på holdet." });
    // Nothing written freely: without a fine from the catalogue there is no fine.
    expect(await give({ playerId: anna.id, reason: "Glemt støvler" })).toEqual({ ok: false, error: "Vælg en bøde fra kataloget." });
    expect(await give({ playerId: anna.id, reason: "x", units: "3" })).toEqual({ ok: false, error: "Vælg en bøde fra kataloget." });
    expect(await give({ playerId: anna.id, fineTypeId: archived.id })).toEqual({ ok: false, error: "Bøden findes ikke i kataloget længere." });
    expect(await give({ playerId: anna.id, fineTypeId: theirType.id })).toEqual({ ok: false, error: "Bøden findes ikke i kataloget længere." });
    expect(await give({ playerId: anna.id, fineTypeId: type.id, matchId: theirMatch.id })).toEqual({ ok: false, error: "Kampen findes ikke." });
    expect(await prisma.fine.count()).toBe(0);
  });

  it("is for everybody on the team, a player included", async () => {
    const { team, anna, bo } = await makeSquad();
    const type = await prisma.fineType.create({ data: { teamId: team.id, name: "Kom for sent", units: 1 } });
    await signIn(anna);
    expect(await giveFine(undefined, formData({ playerId: bo.id, fineTypeId: type.id }))).toEqual({ ok: true, note: "Bøden er givet." });
    expect(await prisma.fine.findFirstOrThrow()).toMatchObject({ playerId: bo.id, issuedById: anna.id });
  });
});

describe("deleteFine", () => {
  it("deletes a challenge's fines together, and the challenge with them", async () => {
    const { team, treasurer, anna, bo } = await makeSquad();
    const challenge = await prisma.challenge.create({
      data: { teamId: team.id, reportedById: anna.id, winnerId: anna.id, loserId: bo.id, description: "Mål", units: 2, status: "SETTLED", settledAt: new Date() },
    });
    const fine = (playerId: string, units: number) =>
      prisma.fine.create({ data: { teamId: team.id, playerId, reason: "x", units, unitPriceKr: 10, issuedById: treasurer.id, challengeId: challenge.id } });
    const lost = await fine(bo.id, 2);
    await fine(anna.id, -2);
    await signIn(treasurer);
    expect(await deleteFine(undefined, formData({ id: lost.id }))).toEqual({ ok: true });
    expect(await prisma.fine.count()).toBe(0);
    expect(await prisma.challenge.count()).toBe(0);
  });

  it("lets whoever gave a fine take it back, and nobody else but the fine managers", async () => {
    const { team, anna, bo, treasurer } = await makeSquad();
    const byAnna = await prisma.fine.create({ data: { teamId: team.id, playerId: treasurer.id, reason: "x", units: 1, unitPriceKr: 10, issuedById: anna.id } });
    const byBo = await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "y", units: 1, unitPriceKr: 10, issuedById: bo.id } });
    await signIn(anna);
    expect(await deleteFine(undefined, formData({ id: byBo.id }))).toEqual({
      ok: false,
      error: "Kun den der gav bøden, bødekasseformanden eller en admin kan slette den.",
    });
    expect(await deleteFine(undefined, formData({ id: byAnna.id }))).toEqual({ ok: true });
    await signIn(treasurer);
    expect(await deleteFine(undefined, formData({ id: byBo.id }))).toEqual({ ok: true });
    expect(await prisma.fine.count()).toBe(0);
  });

  it("cannot delete another team's fine", async () => {
    const { treasurer } = await makeSquad();
    const other = await makeSquad("Andre");
    const fine = await prisma.fine.create({
      data: { teamId: other.team.id, playerId: other.anna.id, reason: "x", units: 1, unitPriceKr: 10, issuedById: other.admin.id },
    });
    await signIn(treasurer);
    expect(await deleteFine(undefined, formData({ id: fine.id }))).toEqual({ ok: true });
    expect(await prisma.fine.count()).toBe(1);
  });
});

describe("paying the box", () => {
  async function fined() {
    const squad = await makeSquad();
    const fine = (playerId: string, units: number) =>
      prisma.fine.create({ data: { teamId: squad.team.id, playerId, reason: "x", units, unitPriceKr: 10, issuedById: squad.treasurer.id } });
    await fine(squad.anna.id, 5);
    await fine(squad.anna.id, 2);
    await fine(squad.bo.id, 3);
    const board = () => fineBoard(squad.team.id);
    const open = async () => {
      await signIn(squad.admin);
      expect(await setFinePayment(undefined, formData({ open: "1" }))).toEqual({ ok: true, note: "Bødekassen er åben for betaling." });
    };
    return { ...squad, fine, board, open };
  }

  it("is opened by an admin, once, and closes again while nobody has paid", async () => {
    const { team, board, open } = await fined();
    expect((await board()).paymentOpenedAt).toBeNull();
    await open();
    expect((await board()).paymentOpenedAt).toBeInstanceOf(Date);
    expect(await setFinePayment(undefined, formData({ open: "1" }))).toEqual({ ok: false, error: "Bødekassen er allerede åben for betaling." });
    expect(await setFinePayment(undefined, formData({ open: "0" }))).toEqual({ ok: true, note: "Bødekassen er lukket for betaling igen." });
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({ finePaymentOpenedAt: null });
  });

  it("is opened by an admin only, and never another team's", async () => {
    const { treasurer, anna, team } = await fined();
    const other = await makeSquad("Andre");
    await signIn(treasurer);
    await expectDenied(() => setFinePayment(undefined, formData({ open: "1" })));
    await signIn(anna);
    await expectDenied(() => setFinePayment(undefined, formData({ open: "1" })));
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).finePaymentOpenedAt).toBeNull();
    await signIn(other.admin);
    await setFinePayment(undefined, formData({ open: "1" }));
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).finePaymentOpenedAt).toBeNull();
  });

  it("stops new fines and challenges while it is open", async () => {
    const { team, anna, bo, admin, open } = await fined();
    await signIn(anna);
    await createChallenge(undefined, formData({ opponentId: bo.id, outcome: "won", description: "Mål", units: "2" }));
    const waiting = await prisma.challenge.findFirstOrThrow({ where: { teamId: team.id } });
    await open();
    const refused = { ok: false, error: "Bødekassen er åben for betaling. Nye bøder og udfordringer venter til næste sæson." };
    expect(await giveFine(undefined, formData({ playerId: bo.id, reason: "For sent" }))).toEqual(refused);
    await signIn(anna);
    expect(await createChallenge(undefined, formData({ opponentId: bo.id, outcome: "won", description: "Mål", units: "1" }))).toEqual(refused);
    await signIn(admin);
    expect(await moveChallenge(undefined, formData({ id: waiting.id, move: "approve" }))).toEqual(refused);
    expect(await prisma.fine.count({ where: { teamId: team.id } })).toBe(3);
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("PENDING");
  });

  it("marks a player paid, all or nothing, without touching the fines", async () => {
    const { treasurer, admin, anna, bo, board, open } = await fined();
    await signIn(treasurer);
    expect(await markFinesPaid(undefined, formData({ playerId: anna.id, paid: "1" }))).toEqual({
      ok: false,
      error: "Bødekassen er ikke åben for betaling endnu.",
    });
    await open();
    expect((await board()).missingKr).toBe(100);
    await signIn(treasurer);
    expect(await markFinesPaid(undefined, formData({ playerId: anna.id, paid: "1" }))).toEqual({ ok: true, note: "Markeret som betalt." });
    const after = await board();
    expect(after.paid.has(anna.id)).toBe(true);
    expect(after.paid.has(bo.id)).toBe(false);
    // Her fines still say what they came to; the box is only missing Bo's.
    expect(after.balances.find((b) => b.userId === anna.id)).toMatchObject({ owesKr: 70, units: 7 });
    expect(after).toMatchObject({ totalKr: 100, missingKr: 30 });
    expect(await prisma.fine.count()).toBe(3);

    // Paid once, the box stays open until the new season.
    await signIn(admin);
    expect((await setFinePayment(undefined, formData({ open: "0" })))?.ok).toBe(false);
    expect((await board()).paymentOpenedAt).toBeInstanceOf(Date);

    expect(await markFinesPaid(undefined, formData({ playerId: anna.id, paid: "0" }))).toEqual({ ok: true, note: "Ikke længere markeret som betalt." });
    expect((await board()).paid.size).toBe(0);
  });

  it("refuses to close once somebody is marked paid", async () => {
    const { admin, anna, open } = await fined();
    await open();
    await markFinesPaid(undefined, formData({ playerId: anna.id, paid: "1" }));
    await signIn(admin);
    expect(await setFinePayment(undefined, formData({ open: "0" }))).toEqual({
      ok: false,
      error: "Nogen er allerede markeret som betalt. Bødekassen lukker, når den nye sæson starter.",
    });
  });

  it("is the treasurer's and the admin's, not a player's, and never another team's player", async () => {
    const { anna, bo, treasurer, board, open } = await fined();
    const other = await makeSquad("Andre");
    await open();
    await signIn(anna);
    await expectDenied(() => markFinesPaid(undefined, formData({ playerId: bo.id, paid: "1" })));
    await expectDenied(() => markFinesPaid(undefined, formData({ playerId: anna.id, paid: "1" })));
    expect((await board()).paid.size).toBe(0);

    await signIn(treasurer);
    expect(await markFinesPaid(undefined, formData({ playerId: other.anna.id, paid: "1" }))).toEqual({ ok: false, error: "Spilleren er ikke på holdet." });
    expect(await prisma.teamMember.count({ where: { finesPaidAt: { not: null } } })).toBe(0);
  });

  it("keeps the account of somebody who has left", async () => {
    const { team, anna } = await fined();
    await prisma.teamMember.delete({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } });
    const board = await fineBoard(team.id);
    expect(board.people.get(anna.id)).toMatchObject({ name: "Anna", onTeam: false });
    expect(board.balances.find((b) => b.userId === anna.id)).toMatchObject({ owesKr: 70 });
  });
});

describe("challenges", () => {
  /** Anna owes 5 fines and reports beating Bo. */
  async function challenge(units = 3, outcome = "won") {
    const squad = await makeSquad("Swingkings", { finePriceKr: 10 });
    for (const player of [squad.anna, squad.bo]) {
      await prisma.fine.create({ data: { teamId: squad.team.id, playerId: player.id, reason: "x", units: 5, unitPriceKr: 10, issuedById: squad.admin.id } });
    }
    await signIn(squad.anna);
    expect(await createChallenge(undefined, formData({ opponentId: squad.bo.id, outcome, description: "Første mål", units: String(units) }))).toEqual({
      ok: true,
      note: "Udfordringen venter på godkendelse.",
    });
    const row = await prisma.challenge.findFirstOrThrow({ where: { teamId: squad.team.id } });
    const move = async (as: { id: string }, m: string) => {
      await signIn(as);
      return moveChallenge(undefined, formData({ id: row.id, move: m }));
    };
    const state = () => prisma.challenge.findUniqueOrThrow({ where: { id: row.id } });
    const owes = async (id: string) => (await fineBoard(squad.team.id)).balances.find((b) => b.userId === id)!.units;
    return { ...squad, row, move, state, owes };
  }

  it("is reported, then approved by somebody else, and the stake moves from winner to loser", async () => {
    const { anna, bo, treasurer, row, move, state, owes } = await challenge(3);
    expect(row).toMatchObject({ status: "PENDING", reportedById: anna.id, winnerId: anna.id, loserId: bo.id, units: 3 });
    expect(await move(anna, "approve")).toEqual({ ok: false, error: "Det kan du ikke gøre med udfordringen nu." });
    expect(await owes(anna.id)).toBe(5);

    // Not only the opponent: anybody else on the team may approve.
    expect(await move(treasurer, "approve")).toEqual({ ok: true });
    expect(await state()).toMatchObject({ status: "SETTLED", approvedById: treasurer.id });
    expect(await owes(anna.id)).toBe(2);
    expect(await owes(bo.id)).toBe(8);
    expect(await move(bo, "approve")).toEqual({ ok: false, error: "Det kan du ikke gøre med udfordringen nu." });
  });

  it("can be reported by the loser, and approved by the winner", async () => {
    const { anna, bo, row, move, owes } = await challenge(2, "lost");
    expect(row).toMatchObject({ winnerId: bo.id, loserId: anna.id });
    expect(await move(bo, "approve")).toEqual({ ok: true });
    expect(await owes(bo.id)).toBe(3);
    expect(await owes(anna.id)).toBe(7);
  });

  it("lets the reporter or a treasurer withdraw it, and nobody else; withdrawn, it is gone", async () => {
    const { anna, bo, row, move } = await challenge();
    expect((await move(bo, "cancel"))?.ok).toBe(false);
    expect(await move(anna, "cancel")).toEqual({ ok: true });
    expect(await prisma.challenge.findUnique({ where: { id: row.id } })).toBeNull();
    expect(await move(bo, "approve")).toEqual({ ok: false, error: "Udfordringen findes ikke." });

    const second = await challenge();
    expect(await second.move(second.treasurer, "cancel")).toEqual({ ok: true });
    expect(await prisma.fine.count({ where: { challengeId: { not: null } } })).toBe(0);
  });

  it("refuses a stake bigger than the winner owes, and a winner with nothing to win away", async () => {
    const { team, anna, bo, admin } = await makeSquad();
    await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "x", units: 2, unitPriceKr: 10, issuedById: admin.id } });
    await signIn(anna);
    const send = (fields: Record<string, string>) =>
      createChallenge(undefined, formData({ opponentId: bo.id, outcome: "won", description: "x", units: "1", ...fields }));
    expect(await send({ units: "3" })).toEqual({ ok: false, error: "Du har kun 2 bøder — indsatsen kan højst være det." });
    expect(await send({ outcome: "lost" })).toEqual({ ok: false, error: "Bo har ingen bøder at udfordre sig ud af." });
    expect(await send({ outcome: "maybe" })).toEqual({ ok: false, error: "Vælg hvem der vandt." });
    expect(await send({ units: "2" })).toEqual({ ok: true, note: "Udfordringen venter på godkendelse." });
  });

  it("refuses challenging yourself, a stranger, another team's match and challenge, and nonsense moves", async () => {
    const { anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirMatch = await makeMatch(other.team.id);
    await signIn(anna);
    const send = (fields: Record<string, string>) => createChallenge(undefined, formData({ description: "x", units: "1", outcome: "won", ...fields }));
    expect(await send({ opponentId: anna.id })).toEqual({ ok: false, error: "Du kan ikke udfordre dig selv." });
    expect(await send({ opponentId: other.anna.id })).toEqual({ ok: false, error: "Spilleren er ikke på holdet." });
    expect(await send({ opponentId: bo.id, matchId: theirMatch.id })).toEqual({ ok: false, error: "Kampen findes ikke." });
    expect((await send({ opponentId: bo.id, units: "51" }))?.ok).toBe(false);
    expect(await moveChallenge(undefined, formData({ id: "x", move: "explode" }))).toEqual({ ok: false, error: "Prøv igen." });

    const theirs = await prisma.challenge.create({
      data: { teamId: other.team.id, reportedById: other.anna.id, winnerId: other.anna.id, loserId: other.bo.id, description: "x", units: 1 },
    });
    expect(await moveChallenge(undefined, formData({ id: theirs.id, move: "approve" }))).toEqual({ ok: false, error: "Udfordringen findes ikke." });
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("PENDING");
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => createChallenge(undefined, formData({})));
  });
});

describe("fine data", () => {
  it("crowns this month's most-fined, and lists recent matches as options", async () => {
    const { team, treasurer, anna, bo } = await makeSquad();
    const fine = (playerId: string, units: number, createdAt = new Date()) =>
      prisma.fine.create({ data: { teamId: team.id, playerId, reason: "x", units, unitPriceKr: 10, issuedById: treasurer.id, createdAt } });
    await fine(anna.id, 3);
    await fine(bo.id, 2);
    await fine(bo.id, 1);
    await fine(bo.id, 50, new Date(Date.now() - 62 * 24 * 60 * 60 * 1000));
    expect(await monthKings(team.id)).toEqual({ userIds: [anna.id, bo.id].sort(), kr: 30 });

    await makeMatch(team.id, { opponent: "Snart", startsAt: new Date(Date.now() + 86_400_000) });
    await makeMatch(team.id, { opponent: "Længe siden", startsAt: new Date(Date.now() - 90 * 86_400_000) });
    await makeMatch(team.id, { opponent: "Træning", kind: "TRAINING" });
    const options = await matchOptions(team.id);
    expect(options.map((o) => o.label.split(" · ")[0])).toEqual(["Snart"]);
  });

  it("puts everybody on the board, the clean sheets too", async () => {
    const { team } = await makeSquad();
    await makeMember(team.id, "Ny");
    const board = await fineBoard(team.id);
    expect(board.balances).toHaveLength(5);
    expect(board.finePriceKr).toBe(10);
  });

  it("lists the team's newest fines first, and never another team's", async () => {
    const { team, treasurer, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const fine = (teamId: string, playerId: string, issuedById: string, reason: string, minutesAgo: number) =>
      prisma.fine.create({
        data: { teamId, playerId, issuedById, reason, units: 1, unitPriceKr: 10, createdAt: new Date(Date.now() - minutesAgo * 60_000) },
      });
    await fine(team.id, anna.id, treasurer.id, "Ældst", 30);
    await fine(team.id, bo.id, treasurer.id, "Midt", 20);
    await fine(team.id, anna.id, bo.id, "Nyest", 10);
    await fine(other.team.id, other.anna.id, other.treasurer.id, "De andres", 0);

    const all = await fineHistory(team.id, { take: 10 });
    expect(all.map((f) => f.reason)).toEqual(["Nyest", "Midt", "Ældst"]);
    expect(all[0]).toMatchObject({ issuedById: bo.id, player: { id: anna.id, name: "Anna" } });
    expect((await fineHistory(team.id, { take: 2 })).map((f) => f.reason)).toEqual(["Nyest", "Midt"]);
    expect(await fineHistory(other.team.id, { take: 10 })).toHaveLength(1);
  });

  it("narrows to one player or one activity, all of them without a limit, and never another team's", async () => {
    const { team, treasurer, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const match = await makeMatch(team.id, { opponent: "FC Nabo" });
    const give = (teamId: string, playerId: string, issuedById: string, reason: string, matchId?: string) =>
      prisma.fine.create({ data: { teamId, playerId, issuedById, reason, units: 1, unitPriceKr: 10, matchId } });
    await give(team.id, anna.id, treasurer.id, "Annas første");
    await give(team.id, anna.id, treasurer.id, "Annas til kampen", match.id);
    await give(team.id, bo.id, treasurer.id, "Bos til kampen", match.id);
    await give(other.team.id, other.anna.id, other.treasurer.id, "De andres");

    expect((await fineHistory(team.id, { playerId: anna.id })).map((f) => f.reason).sort()).toEqual(["Annas første", "Annas til kampen"]);
    expect((await fineHistory(team.id, { matchId: match.id })).map((f) => f.reason).sort()).toEqual(["Annas til kampen", "Bos til kampen"]);
    expect(await fineHistory(team.id)).toHaveLength(3);
    // Another team's player or activity is nobody here.
    expect(await fineHistory(team.id, { playerId: other.anna.id })).toEqual([]);
    expect(await fineHistory(other.team.id, { matchId: match.id })).toEqual([]);
    // One fine by its id, for its sheet — and another team's id finds nothing.
    const one = await prisma.fine.findFirstOrThrow({ where: { teamId: team.id, reason: "Annas første" } });
    expect((await fineHistory(team.id, { id: one.id })).map((f) => f.reason)).toEqual(["Annas første"]);
    expect(await fineHistory(other.team.id, { id: one.id })).toEqual([]);
  });

  it("carries what a fine's sheet shows: the giver, the note, the activity and the challenge it came from", async () => {
    const { team, admin, treasurer, anna, bo } = await makeSquad();
    const match = await makeMatch(team.id, { opponent: "FC Nabo" });
    await prisma.fine.create({
      data: { teamId: team.id, playerId: anna.id, issuedById: treasurer.id, reason: "For sent", note: "Ti minutter", units: 5, unitPriceKr: 10, matchId: match.id },
    });
    await signIn(anna);
    await createChallenge(undefined, formData({ opponentId: bo.id, outcome: "won", description: "Flest mål", units: "2" }));
    const challenge = await prisma.challenge.findFirstOrThrow({ where: { teamId: team.id } });
    await signIn(admin);
    expect(await moveChallenge(undefined, formData({ id: challenge.id, move: "approve" }))).toEqual({ ok: true });

    const fines = await fineHistory(team.id, { take: 10 });
    const plain = fines.find((f) => f.reason === "For sent")!;
    expect(plain).toMatchObject({ note: "Ti minutter", issuedBy: { name: "Kasserer" }, match: { opponent: "FC Nabo" }, challenge: null });
    const moved = fines.filter((f) => f.challengeId === challenge.id);
    expect(moved.map((f) => f.units).sort()).toEqual([-2, 2]);
    for (const fine of moved) {
      expect(fine.challenge).toMatchObject({
        description: "Flest mål",
        units: 2,
        status: "SETTLED",
        winner: { id: anna.id },
        loser: { id: bo.id },
        reportedBy: { name: "Anna" },
        approvedBy: { name: admin.name },
      });
    }
  });
});
