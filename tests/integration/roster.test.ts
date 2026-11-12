import { describe, expect, it } from "vitest";
import { teamRoster } from "@/lib/roster";
import { foundOr404 } from "@/lib/scoped";
import { teamDb } from "@/lib/team-db";
import { makeMatch, makeMember, makeTeam } from "../helpers/factories";
import { expectNotFound } from "../helpers/expect";

describe("teamRoster", () => {
  it("lists the team in Danish alphabetical order, Æ, Ø and Å last, and nobody else", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Andre");
    for (const name of ["Åse", "Bo", "Øjvind", "anna", "Ævar", "Zara"]) await makeMember(team.id, name);
    await makeMember(other.id, "Fremmed");
    const roster = await teamRoster(team.id);
    expect(roster.map((m) => m.name)).toEqual(["anna", "Bo", "Zara", "Ævar", "Øjvind", "Åse"]);
    expect(roster[0]).toMatchObject({ role: "PLAYER", shirtNumber: null, takesTasks: true, photoId: null });
  });
});

describe("foundOr404", () => {
  it("returns the team's own record, and answers 404 for another team's as for nothing at all", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Andre");
    const ours = await makeMatch(team.id);
    const theirs = await makeMatch(other.id);
    expect((await foundOr404(teamDb(team.id).match.findFirst({ where: { id: ours.id } }))).id).toBe(ours.id);
    await expectNotFound(() => foundOr404(teamDb(team.id).match.findFirst({ where: { id: theirs.id } })));
    await expectNotFound(() => foundOr404(teamDb(team.id).match.findFirst({ where: { id: "findes-ikke" } })));
  });
});
