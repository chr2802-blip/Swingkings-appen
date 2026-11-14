import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("a coach marks a player's kontingent paid, and the whole team sees it", async ({ page, loginAs }) => {
  const { team, admin, anna } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  const row = page.getByRole("listitem").filter({ has: page.getByText("Anna", { exact: true }) });
  await expect(row.getByText("Mangler kontingent")).toBeVisible();
  await row.getByRole("button", { name: "Handlinger for Anna" }).click();
  await page.getByRole("dialog", { name: "Anna" }).getByRole("button", { name: "Ret" }).click();
  const form = page.getByRole("dialog", { name: "Anna" });
  await form.getByLabel("Kontingent betalt for sæsonen").check();
  await form.getByRole("button", { name: "Gem" }).click();
  await expect
    .poll(async () => (await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } })).duesPaidAt)
    .not.toBeNull();

  await loginAs(anna);
  await page.goto("/hold/spillere");
  await expect(page.getByText("1 af 4 har betalt kontingent", { exact: false })).toBeVisible();
  const annaRow = page.getByRole("link").filter({ has: page.getByText("Anna", { exact: true }) });
  await expect(annaRow.getByText("Kontingent betalt")).toBeVisible();
  const boRow = page.getByRole("link").filter({ has: page.getByText("Bo", { exact: true }) });
  await expect(boRow.getByText("Mangler kontingent")).toBeVisible();
});

test("a coach goes through the season guide, starts a new season and lands on its summary", async ({ page, loginAs }) => {
  const { team, admin, treasurer, anna, bo } = await squad();
  await db.fine.createMany({
    data: [
      { teamId: team.id, playerId: anna.id, reason: "For sent", units: 3, unitPriceKr: 10, issuedById: treasurer.id },
      { teamId: team.id, playerId: bo.id, reason: "For sent", units: 1, unitPriceKr: 10, issuedById: treasurer.id },
    ],
  });
  await db.teamMember.updateMany({ where: { teamId: team.id }, data: { duesPaidAt: new Date() } });
  const past = await db.match.create({ data: { teamId: team.id, title: "Swingkings - B.93", opponent: "B.93", startsAt: new Date(Date.now() - 86_400_000) } });
  const next = await db.match.create({ data: { teamId: team.id, title: "Swingkings - AB", opponent: "AB", startsAt: new Date(Date.now() + 86_400_000) } });

  await loginAs(admin);
  await page.goto("/hold");
  await page.getByRole("link", { name: "Start ny sæson" }).click();
  await expect(page).toHaveURL(/\/hold\/saeson$/);
  await expect(page.getByText(/40 kr\.? står stadig udestående hos 2 spillere/)).toBeVisible();
  await expect(page.getByText("1 afsluttet aktivitet slettes", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Start ny sæson" }).click();
  const dialog = page.getByRole("dialog", { name: "Start ny sæson" });
  await dialog.getByLabel("Navn på sæsonen der slutter").fill("Sæson 2026");
  await dialog.getByLabel("Jeg forstår, at det ikke kan fortrydes").check();
  await dialog.getByRole("button", { name: "Start ny sæson" }).click();

  await expect(page).toHaveURL(/\/hold\/saesoner$/);
  await expect(page.getByRole("heading", { name: "Sæson 2026" })).toBeVisible();
  await expect(page.getByText("Sæsonens bødekonger")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Anna" }).first()).toContainText("30 kr");

  expect(await db.fine.count({ where: { teamId: team.id } })).toBe(0);
  expect(await db.match.findMany({ where: { teamId: team.id }, select: { id: true } })).toEqual([{ id: next.id }]);
  expect(await db.match.count({ where: { id: past.id } })).toBe(0);
  expect(await db.teamMember.count({ where: { teamId: team.id, duesPaidAt: { not: null } } })).toBe(0);
});

test("a player reads the past seasons but is kept out of the guide", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.season.create({
    data: {
      teamId: team.id,
      name: "Sæson 2025",
      startedAt: new Date("2025-01-01T12:00:00Z"),
      endedAt: new Date("2025-12-01T12:00:00Z"),
      summary: { fines: 12, kr: 340, topFined: [{ name: "Bo", units: 9, kr: 90 }], topReason: { reason: "Mobil i omklædningsrummet", count: 4 } },
    },
  });
  await loginAs(anna);
  await page.goto("/hold/saesoner");
  await expect(page.getByRole("heading", { name: "Sæson 2025" })).toBeVisible();
  await expect(page.getByText("Mobil i omklædningsrummet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny sæson" })).toHaveCount(0);

  await page.goto("/hold/saeson");
  await expect(page).toHaveURL(/\/hold\/saesoner$/);
  await expect(page.getByRole("button", { name: "Start ny sæson" })).toHaveCount(0);
});
