import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { loadFineDetails } from "@/app/actions/fine-details";
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
