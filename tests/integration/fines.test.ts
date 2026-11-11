import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createChallenge,
  deleteFine,
  deletePayment,
  giveFine,
  moveChallenge,
  recordPayment,
  removeFineType,
  saveFineType,
} from "@/app/actions/fines";
import { fineBoard, matchOptions, monthKings } from "@/lib/fine-data";
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
    expect(board.balances.find((b) => b.userId === anna.id)).toMatchObject({ finedKr: 40, owesKr: 40 });
  });

  it("takes a freely written fine, one unless told otherwise, and overrides a type's units", async () => {
    const { team, treasurer, anna } = await makeSquad();
    const type = await prisma.fineType.create({ data: { teamId: team.id, name: "Rødt kort", units: 10 } });
    const match = await makeMatch(team.id);
    await signIn(treasurer);
    expect(await giveFine(undefined, formData({ playerId: anna.id, reason: "Glemt støvler" }))).toEqual({ ok: true, note: "Bøden er givet." });
    await giveFine(undefined, formData({ playerId: anna.id, fineTypeId: type.id, units: "4", matchId: match.id, note: "Diskussion" }));
    const fines = await prisma.fine.findMany({ where: { playerId: anna.id }, orderBy: { createdAt: "asc" } });
    expect(fines.map((f) => [f.reason, f.units])).toEqual([
      ["Glemt støvler", 1],
      ["Rødt kort", 4],
    ]);
    expect(fines[1]).toMatchObject({ matchId: match.id, note: "Diskussion" });
  });

  it("refuses what it cannot give", async () => {
    const { team, treasurer, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const archived = await prisma.fineType.create({ data: { teamId: team.id, name: "Gammel", units: 1, archivedAt: new Date() } });
    const theirMatch = await makeMatch(other.team.id);
    await signIn(treasurer);
    const give = (fields: Record<string, string | string[]>) => giveFine(undefined, formData(fields));

    expect(await give({ reason: "x" })).toEqual({ ok: false, error: "Vælg mindst én spiller." });
    expect(await give({ playerId: other.anna.id, reason: "x" })).toEqual({ ok: false, error: "En af spillerne er ikke på holdet." });
    expect(await give({ playerId: anna.id })).toEqual({ ok: false, error: "Vælg en bøde fra kataloget eller skriv hvad den er for." });
    expect(await give({ playerId: anna.id, fineTypeId: archived.id })).toEqual({ ok: false, error: "Bøden findes ikke i kataloget længere." });
    expect((await give({ playerId: anna.id, reason: "x", units: "0" }))?.ok).toBe(false);
    expect((await give({ playerId: anna.id, reason: "x", units: "1.5" }))?.ok).toBe(false);
    expect(await give({ playerId: anna.id, reason: "x", matchId: theirMatch.id })).toEqual({ ok: false, error: "Kampen findes ikke." });
    expect(await prisma.fine.count()).toBe(0);
  });

  it("is refused to a player", async () => {
    const { anna, bo } = await makeSquad();
    await signIn(anna);
    await expectDenied(() => giveFine(undefined, formData({ playerId: bo.id, reason: "Hævn" })));
  });
});

describe("deleteFine", () => {
  it("deletes a fine, and reopens the challenge one settled", async () => {
    const { team, treasurer, anna, bo } = await makeSquad();
    const challenge = await prisma.challenge.create({
      data: { teamId: team.id, challengerId: anna.id, opponentId: bo.id, description: "Mål", units: 2, status: "SETTLED", winnerId: anna.id, settledAt: new Date() },
    });
    const fine = await prisma.fine.create({
      data: { teamId: team.id, playerId: bo.id, reason: "Tabt", units: 2, unitPriceKr: 10, issuedById: anna.id, challengeId: challenge.id },
    });
    await signIn(treasurer);
    expect(await deleteFine(undefined, formData({ id: fine.id }))).toEqual({ ok: true });
    expect(await prisma.fine.count()).toBe(0);
    expect(await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).toMatchObject({
      status: "ACCEPTED",
      winnerId: null,
      settledAt: null,
    });
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

describe("payments", () => {
  it("records a payment that brings the balance down, and deletes it again", async () => {
    const { team, treasurer, anna } = await makeSquad();
    await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "x", units: 5, unitPriceKr: 10, issuedById: treasurer.id } });
    await signIn(treasurer);
    expect(await recordPayment(undefined, formData({ playerId: anna.id, amountKr: "30", note: "MobilePay" }))).toEqual({
      ok: true,
      note: "30 kr er registreret.",
    });
    expect((await fineBoard(team.id)).balances.find((b) => b.userId === anna.id)).toMatchObject({ finedKr: 50, paidKr: 30, owesKr: 20 });

    const payment = await prisma.payment.findFirstOrThrow();
    await deletePayment(undefined, formData({ id: payment.id }));
    expect(await prisma.payment.count()).toBe(0);
  });

  it("takes a payment from somebody who has left but still owes", async () => {
    const { team, treasurer, anna } = await makeSquad();
    await prisma.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "x", units: 1, unitPriceKr: 10, issuedById: treasurer.id } });
    await prisma.teamMember.delete({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } });
    await signIn(treasurer);
    expect((await recordPayment(undefined, formData({ playerId: anna.id, amountKr: "10" })))?.ok).toBe(true);

    const board = await fineBoard(team.id);
    expect(board.people.get(anna.id)).toMatchObject({ name: "Anna", onTeam: false });
  });

  it("refuses a stranger and a silly amount", async () => {
    const { treasurer } = await makeSquad();
    const other = await makeSquad("Andre");
    await signIn(treasurer);
    expect(await recordPayment(undefined, formData({ playerId: other.anna.id, amountKr: "10" }))).toEqual({
      ok: false,
      error: "Spilleren findes ikke på holdet.",
    });
    expect((await recordPayment(undefined, formData({ playerId: treasurer.id, amountKr: "-5" })))?.ok).toBe(false);
  });

  it("is refused to a player", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    await expectDenied(() => recordPayment(undefined, formData({ playerId: anna.id, amountKr: "10" })));
    await expectDenied(() => deletePayment(undefined, formData({ id: "x" })));
  });
});

describe("challenges", () => {
  async function challenge(units = 3) {
    const squad = await makeSquad("Swingkings", { finePriceKr: 10 });
    await signIn(squad.anna);
    expect(await createChallenge(undefined, formData({ opponentId: squad.bo.id, description: "Første mål", units: String(units) }))).toEqual({
      ok: true,
      note: "Udfordringen er sendt.",
    });
    const row = await prisma.challenge.findFirstOrThrow({ where: { teamId: squad.team.id } });
    const move = async (as: { id: string }, m: string, extra: Record<string, string> = {}) => {
      await signIn(as);
      return moveChallenge(undefined, formData({ id: row.id, move: m, ...extra }));
    };
    const state = () => prisma.challenge.findUniqueOrThrow({ where: { id: row.id } });
    return { ...squad, row, move, state };
  }

  it("goes accept → claim → confirm, and writes the loser one fine for the stake", async () => {
    const { anna, bo, row, move, state } = await challenge(3);
    expect(await move(bo, "accept")).toEqual({ ok: true });
    expect((await state()).status).toBe("ACCEPTED");
    expect(await move(anna, "claim", { winnerId: anna.id })).toEqual({ ok: true });
    expect(await state()).toMatchObject({ claimedById: anna.id, claimedWinnerId: anna.id });
    expect(await move(bo, "confirm")).toEqual({ ok: true });

    expect(await state()).toMatchObject({ status: "SETTLED", winnerId: anna.id });
    const fine = await prisma.fine.findFirstOrThrow({ where: { challengeId: row.id } });
    expect(fine).toMatchObject({ playerId: bo.id, units: 3, unitPriceKr: 10 });
  });

  it("lets the other player dispute a claim, and a treasurer settle it", async () => {
    const { anna, bo, treasurer, move, state } = await challenge();
    await move(bo, "accept");
    await move(anna, "claim", { winnerId: anna.id });
    expect(await move(anna, "confirm")).toEqual({ ok: false, error: "Det kan du ikke gøre med udfordringen nu." });
    expect(await move(bo, "dispute")).toEqual({ ok: true });
    expect(await state()).toMatchObject({ status: "ACCEPTED", claimedById: null });

    expect(await move(anna, "settle", { winnerId: anna.id })).toEqual({ ok: false, error: "Det kan du ikke gøre med udfordringen nu." });
    expect(await move(treasurer, "settle", { winnerId: bo.id })).toEqual({ ok: true });
    expect((await prisma.fine.findFirstOrThrow()).playerId).toBe(anna.id);
  });

  it("refuses a second claim and a winner who is not playing", async () => {
    const { anna, bo, treasurer, move } = await challenge();
    await move(bo, "accept");
    expect(await move(anna, "claim", { winnerId: treasurer.id })).toEqual({ ok: false, error: "Vælg hvem der vandt." });
    await move(anna, "claim", { winnerId: anna.id });
    expect(await move(bo, "claim", { winnerId: bo.id })).toEqual({ ok: false, error: "Det kan du ikke gøre med udfordringen nu." });
    expect(await move(treasurer, "settle", {})).toEqual({ ok: false, error: "Vælg hvem der vandt." });
  });

  it("lets only the opponent answer, and the challenger withdraw", async () => {
    const { anna, bo, move, state } = await challenge();
    expect((await move(anna, "accept"))?.ok).toBe(false);
    expect(await move(bo, "decline")).toEqual({ ok: true });
    expect((await state()).status).toBe("DECLINED");

    const second = await challenge();
    expect((await second.move(second.bo, "cancel"))?.ok).toBe(false);
    expect(await second.move(second.anna, "cancel")).toEqual({ ok: true });
    expect((await second.state()).status).toBe("CANCELLED");
  });

  it("refuses challenging yourself, a stranger, another team's match, and nonsense moves", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirMatch = await makeMatch(other.team.id);
    await signIn(anna);
    const send = (fields: Record<string, string>) => createChallenge(undefined, formData({ description: "x", units: "1", ...fields }));
    expect(await send({ opponentId: anna.id })).toEqual({ ok: false, error: "Du kan ikke udfordre dig selv." });
    expect(await send({ opponentId: other.anna.id })).toEqual({ ok: false, error: "Spilleren er ikke på holdet." });
    expect(await send({ opponentId: bo.id, matchId: theirMatch.id })).toEqual({ ok: false, error: "Kampen findes ikke." });
    expect((await send({ opponentId: bo.id, units: "51" }))?.ok).toBe(false);
    expect(await moveChallenge(undefined, formData({ id: "x", move: "explode" }))).toEqual({ ok: false, error: "Prøv igen." });

    const theirs = await prisma.challenge.create({
      data: { teamId: other.team.id, challengerId: other.anna.id, opponentId: other.bo.id, description: "x", units: 1 },
    });
    expect(await moveChallenge(undefined, formData({ id: theirs.id, move: "cancel" }))).toEqual({ ok: false, error: "Udfordringen findes ikke." });
    void team;
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
});
