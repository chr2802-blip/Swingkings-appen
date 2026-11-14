import { test, expect } from "./helpers/fixtures";
import { db, member, squad } from "./helpers/database";

test("a coach renames the team and changes the price of a fine", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  await page.getByLabel("Holdets navn").fill("Swingkings Old Boys");
  await page.getByLabel("Pris for én bøde (kr)").fill("15");
  await page.locator("label").filter({ hasText: /^Grøn$/ }).click();
  await expect(page.getByRole("radio", { name: "Grøn" })).toBeChecked();
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  expect(await db.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({ name: "Swingkings Old Boys", finePriceKr: 15, theme: "GREEN" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "GREEN");
});

test("a KampKlar link that is not a web address is refused with a reason", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  await page.getByLabel("Kalenderlink fra DBU KampKlar").fill("ftp://kampklar.dk/kalender.ics");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText(/Kalenderlinket er ikke en gyldig adresse/)).toBeVisible();
});

test("a player is kept out of the team settings", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/hold");
  await expect(page.getByLabel("Holdets navn")).toHaveCount(0);
});

test("a coach removes a player, who no longer reaches the team", async ({ page, loginAs }) => {
  const { team, admin, bo } = await squad();
  await loginAs(admin);
  await page.goto("/hold/spillere");
  const row = page.getByRole("listitem").filter({ has: page.getByText("Bo", { exact: true }) });
  await row.getByRole("button", { name: "Handlinger for Bo" }).click();
  await page.getByRole("dialog", { name: "Bo" }).getByRole("button", { name: "Fjern fra holdet" }).click();
  // Nothing that cannot be undone happens on the first press: it asks first.
  await page.getByRole("dialog", { name: "Fjern Bo fra holdet?" }).getByRole("button", { name: "Fjern fra holdet" }).click();
  await expect.poll(() => db.teamMember.count({ where: { teamId: team.id, userId: bo.id } })).toBe(0);
  // The page has taken the answer in before it is left: a navigation started while the
  // action's own refresh is still on its way is aborted.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row).toHaveCount(0);

  await loginAs(bo);
  await page.goto("/oversigt");
  await expect(page).toHaveURL(/\/hold\/vaelg$/);
});

test("one team never sees another's fines, matches or chat", async ({ page, loginAs }) => {
  const ours = await squad("Swingkings");
  const theirs = await squad("Naboerne");
  await db.fine.create({ data: { teamId: theirs.team.id, playerId: theirs.anna.id, reason: "Hemmelig bøde", units: 1, unitPriceKr: 10, issuedById: theirs.admin.id } });
  const match = await db.match.create({ data: { teamId: theirs.team.id, title: "Naboerne - Hemmelig FC", opponent: "Hemmelig FC", startsAt: new Date(Date.now() + 86_400_000) } });
  await db.chatMessage.create({ data: { teamId: theirs.team.id, authorId: theirs.anna.id, body: "Hemmelig besked" } });

  await loginAs(ours.anna);
  for (const path of ["/boder", "/aktiviteter", "/chat", "/oversigt"]) {
    await page.goto(path);
    await expect(page.getByText(/Hemmelig/), path).toHaveCount(0);
  }
  const response = await page.goto(`/aktiviteter/${match.id}`);
  expect(response?.status()).toBe(404);
});

test("somebody on two teams switches between them", async ({ page, loginAs }) => {
  const first = await squad("Swingkings");
  const second = await db.team.create({ data: { name: "Søndagsholdet" } });
  await db.teamMember.create({ data: { teamId: second.id, userId: first.anna.id } });
  await member(second.id, "Carl");
  await loginAs(first.anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Swingkings" }).click();
  await page.getByRole("button", { name: /Søndagsholdet/ }).or(page.getByRole("link", { name: /Søndagsholdet/ })).first().click();
  await expect(page.getByRole("button", { name: "Søndagsholdet" })).toBeVisible();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: first.anna.id } })).activeTeamId).toBe(second.id);
});

test("the roster lists everybody on the team with their role", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/hold/spillere");
  await expect(page.getByRole("heading", { name: "Spillere", level: 1 })).toBeVisible();
  for (const name of ["Anna", "Bo", "Kasserer Kim", "Træner Tom"]) await expect(page.getByRole("main").getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("Bødekasseformand").first()).toBeVisible();
});
