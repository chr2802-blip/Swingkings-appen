import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("a treasurer gives two players a catalogue fine, and the board and their accounts show it", async ({ page, loginAs }) => {
  const { team, treasurer, anna, bo } = await squad();
  await db.fineType.create({ data: { teamId: team.id, name: "For sent", units: 2 } });
  await loginAs(treasurer);
  await page.goto("/boder");

  await page.getByRole("button", { name: "Giv bøde" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await dialog.getByRole("checkbox", { name: "Anna" }).check();
  await dialog.getByRole("checkbox", { name: "Bo" }).check();
  await dialog.getByLabel("Bøde fra kataloget").selectOption({ label: "For sent (2 bøder)" });
  await expect(dialog.getByText("I alt 20 kr pr. spiller.")).toBeVisible();
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("link", { name: /Anna .*2 bøder udestående · 20 kr i alt 20 kr/ })).toBeVisible();
  expect(await db.fine.count({ where: { playerId: { in: [anna.id, bo.id] }, units: 2, unitPriceKr: 10 } })).toBe(2);

  await loginAs(anna);
  await page.goto("/oversigt");
  // The card's own text, so a failure says what it showed instead of "not found".
  const account = page.locator('a[href="/boder"]').filter({ hasText: /^Bødekonto/i });
  await expect(account).toContainText("20 kr");
  await expect(account).toContainText("udestående");
});

test("a refused fine keeps the dialog open and says why", async ({ page, loginAs }) => {
  const { treasurer } = await squad();
  await loginAs(treasurer);
  await page.goto("/boder");
  await page.getByRole("button", { name: "Giv bøde" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog.getByText("Vælg mindst én spiller.")).toBeVisible();
  await expect(dialog).toBeVisible();
});

test("a player gives a teammate a fine", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  await page.getByRole("button", { name: "Giv bøde" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await dialog.getByRole("checkbox", { name: "Bo" }).check();
  await dialog.getByLabel("Hvad er bøden for?").fill("Glemte benskinner");
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog).toBeHidden();
  expect(await db.fine.findFirst({ where: { playerId: bo.id } })).toMatchObject({ issuedById: anna.id, reason: "Glemte benskinner" });
});

test("a player sees the catalogue but cannot change it", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.fineType.create({ data: { teamId: team.id, name: "For sent", units: 2 } });
  await loginAs(anna);
  await page.goto("/boder/katalog");
  await expect(page.getByText("For sent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ny bøde" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ret" })).toHaveCount(0);
});

test("a treasurer adds to the catalogue", async ({ page, loginAs }) => {
  const { team, treasurer } = await squad();
  await loginAs(treasurer);
  await page.goto("/boder/katalog");
  await page.getByRole("button", { name: "Ny bøde" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Navn").fill("Rødt kort");
  await dialog.getByLabel("Antal bøder").fill("10");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Rødt kort")).toBeVisible();
  await expect(page.getByText("100 kr")).toBeVisible();
  expect(await db.fineType.count({ where: { teamId: team.id } })).toBe(1);
});

test("a challenge is reported, approved by a third player, and the stake moves to the loser", async ({ page, loginAs }) => {
  const { team, admin, anna, bo } = await squad();
  await db.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "For sent", units: 5, unitPriceKr: 10, issuedById: admin.id } });
  await loginAs(anna);
  await page.goto("/boder/udfordringer");
  await page.getByRole("button", { name: "Udfordring" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hvem spillede du mod?").selectOption({ label: "Bo" });
  await dialog.getByLabel("Hvem vandt?").selectOption({ label: "Jeg vandt" });
  await dialog.getByLabel("Hvad gik udfordringen ud på?").fill("Flest mål på træning");
  await dialog.getByLabel("Indsats (antal bøder)").fill("3");
  await dialog.getByRole("button", { name: "Send til godkendelse" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Venter på at en anden på holdet godkender.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Godkend" })).toHaveCount(0);

  await loginAs(admin);
  await page.goto("/boder/udfordringer");
  await expect(page.getByRole("heading", { name: "Venter på din godkendelse" })).toBeVisible();
  await page.getByRole("button", { name: "Godkend" }).click();
  await expect(page.getByText(/3 bøder flyttet fra Anna til Bo · godkendt af/)).toBeVisible();

  await page.goto("/boder");
  await expect(page.getByRole("link", { name: /Bo .*3 bøder udestående · 30 kr i alt 30 kr/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Anna .*2 bøder udestående · 50 kr i alt 20 kr/ })).toBeVisible();
});

test("a treasurer resets a player, and a player cannot", async ({ page, loginAs }) => {
  const { team, treasurer, anna } = await squad();
  await db.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "For sent", units: 4, unitPriceKr: 10, issuedById: treasurer.id } });
  await loginAs(anna);
  await page.goto(`/boder/spiller/${anna.id}`);
  await expect(page.getByText("For sent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nulstil bøder" })).toHaveCount(0);

  await loginAs(treasurer);
  await page.goto(`/boder/spiller/${anna.id}`);
  await page.getByRole("button", { name: "Nulstil bøder" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Nulstil" }).click();
  await expect(page.getByText(/· nulstillet /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Nulstil bøder" })).toHaveCount(0);
  expect(await db.fine.count({ where: { playerId: anna.id, clearedAt: null } })).toBe(0);
});
