import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";
import { demoPicture } from "../src/lib/demo-pictures";

/**
 * The club's own look on the pages it dresses: the day's match as a fixture poster on the
 * front page, the fine board as a league table, a player's card with their shirt, and jobs
 * that are done when their activity is over.
 */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

test("before match day the next match is a tile on the front page; the poster waits for the day", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const other = await squad("Andre");
  const away = await db.match.create({
    data: { teamId: team.id, kind: "MATCH", title: "B.93 - Swingkings", opponent: "B.93", isHome: false, startsAt: inDays(3), location: "Østerbro Stadion" },
  });
  await db.match.create({ data: { teamId: other.team.id, kind: "MATCH", title: "Fremmede", opponent: "Fremmede FC", startsAt: new Date() } });

  await loginAs(anna);
  await page.goto("/oversigt");
  const tile = page.getByRole("link", { name: /^Næste kamp/ });
  await expect(tile).toContainText("ude mod B.93");
  await expect(page.getByRole("link", { name: /^Kampdag/ })).toHaveCount(0);
  // Another team's match today makes no match day here.
  await expect(page.getByText("Fremmede FC")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Kampdag");
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${away.id}$`));
});

test("on match day the front page shows the match as a fixture, with the opponent's logo and when to meet", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const today = await db.match.create({
    data: { teamId: team.id, kind: "MATCH", title: "Husum BK - Swingkings", opponent: "Husum BK", isHome: false, startsAt: new Date(), note: "Mødetid: 13:45 ved klubhuset" },
  });
  const logo = await db.clubLogo.create({
    data: { key: "husumbk", name: "Husum BK", contentType: "image/png", width: 64, height: 64, bytes: Buffer.from(demoPicture(0).full) },
  });
  await loginAs(anna);
  await page.goto("/oversigt");
  await expect(page.getByRole("heading", { name: "Kampdag, Anna ⚽", level: 1 })).toBeVisible();
  const poster = page.getByRole("link", { name: /^Kampdag: Husum BK mod Swingkings kl\. \d\d:\d\d, mødetid 13:45$/ });
  await expect(poster).toContainText("Mødetid 13:45");
  await expect(poster).toContainText("Ude");
  // The away side's own crest, as the super admin put it in, on the left as the home side.
  const crest = poster.locator(`img[src="/api/club-logos/${logo.id}"]`);
  await expect(crest).toBeVisible();
  expect(await crest.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  // The poster says the match; no tile says it again.
  await expect(page.getByRole("link", { name: /^Næste kamp/ })).toHaveCount(0);
  await poster.click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${today.id}$`));
});

test("the super admin puts in a club's logo under Admin, and it is shared by every team", async ({ page, loginAs }) => {
  const { team } = await squad();
  const root = await db.user.create({ data: { email: "root@e2e.dk", name: "Root", passwordHash: "x", role: "SUPER_ADMIN", activeTeamId: team.id } });
  await loginAs(root);
  await page.goto("/admin");
  const logos = page.getByRole("region", { name: "Klublogoer" });
  await logos.getByLabel("Klub").fill("Hvidovre IF");
  await logos.getByLabel("Logo").setInputFiles({ name: "hif.png", mimeType: "image/png", buffer: Buffer.from(demoPicture(1).full) });
  await logos.getByRole("button", { name: "Gem logo" }).click();
  await expect(logos.getByText("Logoet for Hvidovre IF er gemt.")).toBeVisible();
  await expect(logos.getByRole("listitem").filter({ hasText: "Hvidovre IF" })).toBeVisible();
  expect(await db.clubLogo.count({ where: { key: "hvidovreif" } })).toBe(1);
});

test("the fine board is a table with each player's place and how they moved since last week", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const fine = (playerId: string, units: number, createdAt: Date) =>
    db.fine.create({ data: { teamId: team.id, playerId, reason: "For sent", units, unitPriceKr: 10, createdAt } });
  // A shirt number is not a picture: the board shows people as their pictures (or initials).
  await db.teamMember.updateMany({ where: { teamId: team.id, userId: bo.id }, data: { shirtNumber: 10 } });
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
  await expect(page.getByRole("tabpanel", { name: "Bødetavlen" }).locator("[data-shirt]")).toHaveCount(0);
  // Kroner only, no count of fines; and your own row is marked by its colour, not "(dig)".
  await expect(page.getByRole("tabpanel", { name: "Bødetavlen" })).not.toContainText("Bøder");
  const mine = page.locator('[aria-current="true"]');
  await expect(mine).toContainText("Anna");
  await expect(mine).not.toContainText("(dig)");
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
  // Their place, which leads to the board.
  await expect(page.getByRole("link", { name: "Nummer 1 på bødetavlen" })).toContainText("#1");

  // Somebody with neither picture nor number keeps their initials.
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.locator("main [data-shirt]")).toHaveCount(0);
});

test("nobody ticks a job off: a job on an activity that is over is shown done", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const played = await db.match.create({ data: { teamId: team.id, kind: "MATCH", title: "Swingkings - B.93", opponent: "B.93", startsAt: inDays(-3) } });
  await db.task.create({ data: { teamId: team.id, matchId: played.id, title: "Tøjvask", assignees: { create: { userId: anna.id } } } });

  await loginAs(anna);
  await page.goto(`/aktiviteter/${played.id}/opgaver`);
  const jobs = page.getByRole("tabpanel", { name: /^Opgaver/ });
  // No count on the tab: nothing is left to do.
  await expect(page.getByRole("tab", { name: "Opgaver", exact: true })).toBeVisible();
  await expect(jobs.getByText("Taktiktavlen")).toHaveCount(0);
  await jobs.getByRole("button", { name: /^Tøjvask/ }).click();
  const sheet = page.getByRole("dialog", { name: "Tøjvask" });
  await expect(sheet.getByText("Aktiviteten er overstået")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Markér som|Giv videre/ })).toHaveCount(0);

  // Nor is it waiting on her on the front page.
  await page.goto("/oversigt");
  await expect(page.getByRole("link", { name: /Opgave/ })).toHaveCount(0);
});
