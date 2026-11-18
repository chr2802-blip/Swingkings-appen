import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

/**
 * The club's own look on the pages it dresses: the next match as a fixture poster on the
 * front page, the fine board as a league table, a player's card with their shirt, and an
 * activity's jobs on the tactics board.
 */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

test("the front page shows the next match as a fixture, the home side first, and not another team's", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const other = await squad("Andre");
  const away = await db.match.create({
    data: { teamId: team.id, kind: "MATCH", title: "B.93 - Swingkings", opponent: "B.93", isHome: false, startsAt: inDays(3), location: "Østerbro Stadion" },
  });
  await db.match.create({ data: { teamId: other.team.id, kind: "MATCH", title: "Fremmede", opponent: "Fremmede FC", startsAt: inDays(1) } });

  await loginAs(anna);
  await page.goto("/oversigt");
  const poster = page.getByRole("link", { name: /^Næste kamp: B\.93 mod Swingkings, om 3 dage kl\. \d\d:\d\d$/ });
  await expect(poster).toBeVisible();
  await expect(poster).toContainText("Ude");
  await expect(poster).toContainText("Om 3 dage");
  await expect(poster).toContainText("Østerbro Stadion");
  await expect(page.getByText("Fremmede FC")).toHaveCount(0);
  await poster.click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${away.id}$`));
});

test("on the day of a match the front page says it is match day", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.match.create({ data: { teamId: team.id, kind: "MATCH", title: "Swingkings - Husum BK", opponent: "Husum BK", isHome: true, startsAt: new Date() } });
  await loginAs(anna);
  await page.goto("/oversigt");
  await expect(page.getByRole("heading", { name: "Kampdag, Anna ⚽", level: 1 })).toBeVisible();
  const poster = page.getByRole("link", { name: /^Næste kamp: Swingkings mod Husum BK, i dag/ });
  await expect(poster).toContainText("Kampdag");
  await expect(poster).toContainText("Hjemme");
});

test("the fine board is a table with each player's place and how they moved since last week", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const fine = (playerId: string, units: number, createdAt: Date) =>
    db.fine.create({ data: { teamId: team.id, playerId, reason: "For sent", units, unitPriceKr: 10, createdAt } });
  // A week ago Anna led the table; Bo has overtaken her since.
  await fine(anna.id, 3, daysAgo(10));
  await fine(bo.id, 1, daysAgo(10));
  await fine(bo.id, 5, daysAgo(2));

  await loginAs(anna);
  await page.goto("/boder");
  const rows = page.getByRole("tabpanel", { name: "Bødetavlen" }).getByRole("listitem");
  await expect(rows.first()).toContainText("Bo");
  await expect(page.getByRole("link", { name: /^1 .*op 1 plads siden sidste uge.* Bo .*60 kr/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^2 .*ned 1 plads siden sidste uge.* Anna .*30 kr/ })).toBeVisible();
  // A clean sheet stands still and says so.
  await expect(page.getByRole("link", { name: /samme plads som for en uge siden.* Træner Tom .*ren tavle/ })).toBeVisible();
});

test("a player's page is their card: the shirt with their number, and their place on the board", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await db.teamMember.updateMany({ where: { teamId: team.id, userId: bo.id }, data: { shirtNumber: 10 } });
  await db.fine.create({ data: { teamId: team.id, playerId: bo.id, reason: "Selvmål", units: 5, unitPriceKr: 10 } });

  await loginAs(anna);
  await page.goto(`/spiller/${bo.id}`);
  await expect(page.getByRole("heading", { name: "Bo", level: 1 })).toBeVisible();
  // No picture, so the shirt with the number on its back stands in for one.
  await expect(page.locator('main [data-shirt="10"]').first()).toBeVisible();
  const placed = page.getByRole("term").filter({ hasText: "på tavlen" }).locator("..");
  await expect(placed).toContainText("#1");

  // Somebody with neither picture nor number keeps their initials.
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.locator("main [data-shirt]")).toHaveCount(0);
});

test("an activity's jobs are on the tactics board, which counts those done", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, kind: "MATCH", title: "Swingkings - B.93", opponent: "B.93", startsAt: inDays(4) } });
  await db.task.create({ data: { teamId: team.id, matchId: match.id, title: "Frugt", doneAt: new Date() } });
  await db.task.create({ data: { teamId: team.id, matchId: match.id, title: "Tøjvask" } });

  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  const jobs = page.getByRole("tabpanel", { name: /^Opgaver/ });
  await expect(jobs.getByText("Taktiktavlen")).toBeVisible();
  await expect(jobs.getByText("1 af 2 opgaver klaret")).toBeVisible();

  await db.task.updateMany({ where: { matchId: match.id }, data: { doneAt: new Date() } });
  await page.reload();
  await expect(jobs.getByText("Alle opgaver er klaret 💪")).toBeVisible();
});
