import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createChallenge,
  deleteFine,
  giveFine,
  moveChallenge,
  removeFineType,
  resetFines,
  saveFineType,
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

  it("is for everybody on the team, a player included", async () => {
    const { anna, bo } = await makeSquad();
    await signIn(anna);
    expect(await giveFine(undefined, formData({ playerId: bo.id, reason: "Kom for sent" }))).toEqual({ ok: true, note: "Bøden er givet." });
    expect(await prisma.fine.findFirstOrThrow()).toMatchObject({ playerId: bo.id, issuedById: anna.id });
  });
});

describe("deleteFine", () => {
  it("deletes a challenge's fines together, and withdraws the challenge", async () => {
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
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("CANCELLED");
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

describe("resetFines", () => {
  async function fined() {
    const squad = await makeSquad();
    const fine = (playerId: string, units: number) =>
      prisma.fine.create({ data: { teamId: squad.team.id, playerId, reason: "x", units, unitPriceKr: 10, issuedById: squad.treasurer.id } });
    await fine(squad.anna.id, 5);
    await fine(squad.anna.id, 2);
    await fine(squad.bo.id, 3);
    const owes = async (id: string) => (await fineBoard(squad.team.id)).balances.find((b) => b.userId === id)!;
    return { ...squad, owes };
  }

  it("clears one player's fines, keeping the history", async () => {
    const { treasurer, anna, bo, owes } = await fined();
    await signIn(treasurer);
    expect(await resetFines(undefined, formData({ playerId: anna.id }))).toEqual({ ok: true, note: "Bøderne er nulstillet." });
    expect(await owes(anna.id)).toMatchObject({ owesKr: 0, units: 0, finedKr: 70 });
    expect(await owes(bo.id)).toMatchObject({ owesKr: 30 });
    expect(await prisma.fine.count({ where: { playerId: anna.id, clearedAt: { not: null } } })).toBe(2);
    expect(await resetFines(undefined, formData({ playerId: anna.id }))).toEqual({ ok: false, error: "Der er intet at nulstille." });
  });

  it("clears the whole team at once", async () => {
    const { admin, anna, bo, owes } = await fined();
    await signIn(admin);
    expect(await resetFines(undefined, formData({ playerId: "alle" }))).toEqual({ ok: true, note: "Hele holdet er nulstillet." });
    expect((await owes(anna.id)).owesKr + (await owes(bo.id)).owesKr).toBe(0);
    expect(await resetFines(undefined, formData({ playerId: "alle" }))).toEqual({ ok: false, error: "Ingen har udestående bøder." });
  });

  it("is the treasurer's and the admin's, not a player's, and never another team's", async () => {
    const { anna, bo, treasurer, owes } = await fined();
    const other = await makeSquad("Andre");
    await prisma.fine.create({ data: { teamId: other.team.id, playerId: other.anna.id, reason: "x", units: 1, unitPriceKr: 10, issuedById: other.admin.id } });
    await signIn(anna);
    await expectDenied(() => resetFines(undefined, formData({ playerId: bo.id })));
    expect((await owes(bo.id)).owesKr).toBe(30);

    await signIn(treasurer);
    expect(await resetFines(undefined, formData({ playerId: other.anna.id }))).toEqual({ ok: false, error: "Der er intet at nulstille." });
    await resetFines(undefined, formData({ playerId: "alle" }));
    expect(await prisma.fine.count({ where: { teamId: other.team.id, clearedAt: null } })).toBe(1);
    expect(await resetFines(undefined, formData({}))).toEqual({ ok: false, error: "Vælg hvem der skal nulstilles." });
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

  it("lets the reporter or a treasurer withdraw it, and nobody else", async () => {
    const { anna, bo, move, state } = await challenge();
    expect((await move(bo, "cancel"))?.ok).toBe(false);
    expect(await move(anna, "cancel")).toEqual({ ok: true });
    expect((await state()).status).toBe("CANCELLED");
    expect((await move(bo, "approve"))?.ok).toBe(false);

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

  it("lists the team's newest fines first, cleared ones too, and never another team's", async () => {
    const { team, treasurer, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const fine = (teamId: string, playerId: string, issuedById: string, reason: string, minutesAgo: number, clearedAt?: Date) =>
      prisma.fine.create({
        data: { teamId, playerId, issuedById, reason, units: 1, unitPriceKr: 10, clearedAt, createdAt: new Date(Date.now() - minutesAgo * 60_000) },
      });
    await fine(team.id, anna.id, treasurer.id, "Ældst", 30, new Date());
    await fine(team.id, bo.id, treasurer.id, "Midt", 20);
    await fine(team.id, anna.id, bo.id, "Nyest", 10);
    await fine(other.team.id, other.anna.id, other.treasurer.id, "De andres", 0);

    const all = await fineHistory(team.id, 10);
    expect(all.map((f) => f.reason)).toEqual(["Nyest", "Midt", "Ældst"]);
    expect(all[0]).toMatchObject({ issuedById: bo.id, player: { id: anna.id, name: "Anna" }, clearedAt: null });
    expect(all[2].clearedAt).toBeInstanceOf(Date);
    expect((await fineHistory(team.id, 2)).map((f) => f.reason)).toEqual(["Nyest", "Midt"]);
    expect(await fineHistory(other.team.id, 10)).toHaveLength(1);
  });
});
