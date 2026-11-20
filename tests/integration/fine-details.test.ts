import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { loadChallengeDetails, loadFineDetails } from "@/app/actions/fine-details";
import { makeSquad, signIn, signOut } from "../helpers/factories";
import { expectRedirectToLogin } from "../helpers/expect";

describe("loadFineDetails", () => {
  const give = (teamId: string, playerId: string, issuedById: string, reason: string) =>
    prisma.fine.create({ data: { teamId, playerId, issuedById, reason, note: "Der er vidner", units: 2, unitPriceKr: 10 } });

  it("draws the team's fine for its sheet, with 'Slet' for its giver and the treasurer only", async () => {
    const { team, treasurer, anna, bo } = await makeSquad();
    const fine = await give(team.id, bo.id, anna.id, "For sent");

    await signIn(anna);
    const node = await loadFineDetails(fine.id);
    expect(isValidElement(node)).toBe(true);
    expect((node as ReactElement<{ fine: { id: string } }>).props.fine.id).toBe(fine.id);
    const html = renderToStaticMarkup(node as ReactElement);
    for (const text of ["Bo", "For sent", "Der er vidner", "Anna", "Slet bøden"]) expect(html).toContain(text);

    await signIn(treasurer);
    expect(renderToStaticMarkup((await loadFineDetails(fine.id)) as ReactElement)).toContain("Slet bøden");
    // Bo got it and did not give it: he sees it, but may not delete it.
    await signIn(bo);
    const his = renderToStaticMarkup((await loadFineDetails(fine.id)) as ReactElement);
    expect(his).toContain("For sent");
    expect(his).not.toContain("Slet bøden");
  });

  it("names a giver who has deleted their account as 'Slettet bruger', and nobody may delete it as its giver", async () => {
    const { team, anna, bo } = await makeSquad();
    const fine = await prisma.fine.create({ data: { teamId: team.id, playerId: bo.id, issuedById: null, reason: "For sent", units: 1, unitPriceKr: 10 } });
    await signIn(anna);
    const html = renderToStaticMarkup((await loadFineDetails(fine.id)) as ReactElement);
    expect(html).toContain("Slettet bruger");
    expect(html).not.toContain("Slet bøden");
  });

  it("gives nothing for another team's fine, a deleted one or no id at all", async () => {
    const { team, treasurer, anna } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await give(other.team.id, other.anna.id, other.treasurer.id, "De andres");
    const gone = await give(team.id, anna.id, treasurer.id, "Slettet");
    await prisma.fine.delete({ where: { id: gone.id } });

    await signIn(anna);
    expect(await loadFineDetails(theirs.id)).toBeNull();
    expect(await loadFineDetails(gone.id)).toBeNull();
    expect(await loadFineDetails("")).toBeNull();
    expect(await loadFineDetails(42)).toBeNull();
    expect(await loadFineDetails(undefined)).toBeNull();
  });

  it("sends somebody not logged in to the login page", async () => {
    const { team, treasurer, anna } = await makeSquad();
    const fine = await give(team.id, anna.id, treasurer.id, "For sent");
    signOut();
    await expectRedirectToLogin(() => loadFineDetails(fine.id));
  });
});

describe("loadChallengeDetails", () => {
  const report = (teamId: string, reportedById: string, winnerId: string, loserId: string) =>
    prisma.challenge.create({ data: { teamId, reportedById, winnerId, loserId, description: "Første mål", units: 2 } });
  const html = async (id: unknown) => renderToStaticMarkup((await loadChallengeDetails(id)) as ReactElement);

  it("draws a waiting challenge as a fine's sheet, with exactly the buttons the viewer may press", async () => {
    const { team, admin, treasurer, anna, bo } = await makeSquad();
    const challenge = await report(team.id, anna.id, anna.id, bo.id);

    // The opponent approves; the reporter only withdraws.
    await signIn(bo);
    const his = await html(challenge.id);
    for (const text of ["Anna", "Bo", "Første mål", "Meldt af", "Godkend"]) expect(his).toContain(text);
    expect(his).not.toContain("Træk tilbage");
    await signIn(anna);
    const hers = await html(challenge.id);
    expect(hers).toContain("Træk tilbage");
    expect(hers).not.toContain(">Godkend<");
    // The treasurer may do both; so may an admin, on their own too.
    await signIn(treasurer);
    expect(await html(challenge.id)).toContain("Træk tilbage");
    const own = await report(team.id, admin.id, admin.id, bo.id);
    await signIn(admin);
    const admins = await html(own.id);
    expect(admins).toContain(">Godkend<");
    expect(admins).toContain("Træk tilbage");
  });

  it("gives nothing for another team's challenge, a withdrawn one or no id at all", async () => {
    const { team, anna, bo } = await makeSquad();
    const other = await makeSquad("Andre");
    const theirs = await report(other.team.id, other.anna.id, other.anna.id, other.bo.id);
    const gone = await report(team.id, anna.id, anna.id, bo.id);
    await prisma.challenge.delete({ where: { id: gone.id } });

    await signIn(bo);
    expect(await loadChallengeDetails(theirs.id)).toBeNull();
    expect(await loadChallengeDetails(gone.id)).toBeNull();
    expect(await loadChallengeDetails("")).toBeNull();
    expect(await loadChallengeDetails(42)).toBeNull();
  });

  it("sends somebody not logged in to the login page", async () => {
    const { team, anna, bo } = await makeSquad();
    const challenge = await report(team.id, anna.id, anna.id, bo.id);
    signOut();
    await expectRedirectToLogin(() => loadChallengeDetails(challenge.id));
  });
});
