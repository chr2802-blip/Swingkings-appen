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

  await expect(page.getByRole("link", { name: /Anna .*1 bøde · 20 kr i alt skylder 20 kr/ })).toBeVisible();
  expect(await db.fine.count({ where: { playerId: { in: [anna.id, bo.id] }, units: 2, unitPriceKr: 10 } })).toBe(2);

  await loginAs(anna);
  await page.goto("/oversigt");
  // The card's own text, so a failure says what it showed instead of "not found".
  const account = page.locator('a[href="/boder"]').filter({ hasText: /^Bødekonto/i });
  await expect(account).toContainText("20 kr");
  await expect(account).toContainText("skylder du");
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

test("a challenge goes from sent to settled, and the loser is fined", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/boder/udfordringer");
  await page.getByRole("button", { name: "Udfordr" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hvem udfordrer du?").selectOption({ label: "Bo" });
  await dialog.getByLabel("Hvad går udfordringen ud på?").fill("Flest mål på træning");
  await dialog.getByLabel("Indsats (antal bøder)").fill("3");
  await dialog.getByRole("button", { name: "Send udfordring" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("“Flest mål på træning”")).toBeVisible();

  await loginAs(bo);
  await page.goto("/boder/udfordringer");
  await page.getByRole("button", { name: "Accepter" }).click();
  await page.getByRole("button", { name: "Jeg vandt" }).click();
  await expect(page.getByText(/Venter på bekræftelse/)).toBeVisible();

  await loginAs(anna);
  await page.goto("/boder/udfordringer");
  await page.getByRole("button", { name: "Bekræft" }).click();
  await expect(page.getByText(/Bo.*vandt — Anna har fået bøden/)).toBeVisible();
  expect(await db.fine.findFirst({ where: { playerId: anna.id } })).toMatchObject({ units: 3, reason: "Tabt udfordring: Flest mål på træning" });
});
