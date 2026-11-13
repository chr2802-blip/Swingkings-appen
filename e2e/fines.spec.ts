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

  await expect(page.getByRole("link", { name: /Anna .*20 kr/ })).toBeVisible();
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
  await expect(page.getByRole("link", { name: /Bo .*30 kr/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Anna .*20 kr/ })).toBeVisible();
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

test("the front page leads with what you owe and what is in the box, and keeps the long history on its own page", async ({ page, loginAs }) => {
  const { team, treasurer, anna, bo } = await squad();
  const other = await squad("Andre");
  const give = (teamId: string, playerId: string, issuedById: string, reason: string, minutesAgo: number, clearedAt?: Date) =>
    db.fine.create({
      data: { teamId, playerId, issuedById, reason, units: 1, unitPriceKr: 10, clearedAt, createdAt: new Date(Date.now() - minutesAgo * 60_000) },
    });
  await give(team.id, anna.id, treasurer.id, "Ældste bøde", 60, new Date());
  for (let n = 1; n <= 4; n++) await give(team.id, bo.id, treasurer.id, `Bøde nummer ${n}`, 10 * n);
  await give(team.id, anna.id, bo.id, "Glemte bolde", 1);
  await give(other.team.id, other.anna.id, other.treasurer.id, "De andres bøde", 0);

  await loginAs(anna);
  await page.goto("/boder");
  // Six fines given, one of them reset: 60 kr in all, 50 kr still owed, 10 of them Anna's.
  const mine = page.getByRole("link", { name: /Du skylder/ });
  await expect(mine).toContainText("10 kr");
  await expect(mine).toContainText("1 bøde");
  const box = page.getByText("I kassen").locator("..");
  await expect(box).toContainText("60 kr");
  await expect(box).toContainText("50 kr udestående");
  await expect(page.getByRole("link", { name: /Bo .*40 kr/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "⚔️ Udfordr dig ud af dem ›" })).toHaveAttribute("href", "/boder/udfordringer");

  // Only the newest five here; the oldest waits behind the link.
  await expect(page.getByText("Glemte bolde")).toBeVisible();
  await expect(page.getByText("Bøde nummer 4")).toBeVisible();
  await expect(page.getByText("Ældste bøde")).toHaveCount(0);
  await page.getByRole("link", { name: "Se hele historikken" }).click();
  await expect(page).toHaveURL(/\/boder\/historik$/);
  await expect(page.getByRole("heading", { name: "Historik" })).toBeVisible();
  await expect(page.getByText("Ældste bøde")).toBeVisible();
  await expect(page.getByText(/· nulstillet/)).toBeVisible();
  await expect(page.getByText("De andres bøde")).toHaveCount(0);
  // A player deletes nothing here: none of these were given by Anna.
  await expect(page.getByRole("button", { name: "Slet" })).toHaveCount(0);

  await page.getByRole("link", { name: "Bødekassen" }).click();
  await expect(page).toHaveURL(/\/boder$/);
  await page.getByRole("link", { name: /Du skylder/ }).click();
  await expect(page).toHaveURL(new RegExp(`/boder/spiller/${anna.id}$`));
});

test("the history page lets whoever gave a fine take it back, and is empty before the first fine", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/boder/historik");
  await expect(page.getByText("Ingen bøder endnu.")).toBeVisible();
  await page.goto("/boder");
  await expect(page.getByRole("link", { name: /Du skylder/ })).toContainText("Ren tavle");
  await expect(page.getByRole("link", { name: "Se hele historikken" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Udfordr dig ud af dem/ })).toHaveCount(0);

  await db.fine.create({ data: { teamId: team.id, playerId: bo.id, issuedById: anna.id, reason: "Glemte bolde", units: 1, unitPriceKr: 10 } });
  await page.goto("/boder/historik");
  await page.getByRole("button", { name: "Slet" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Slet bøden" }).click();
  await expect(page.getByText("Ingen bøder endnu.")).toBeVisible();
  expect(await db.fine.count({ where: { teamId: team.id } })).toBe(0);
});

test("the board, the challenges and the catalogue are swiped between, and the dots say where you are", async ({ page, loginAs }) => {
  const { team, treasurer, anna } = await squad();
  await db.fineType.create({ data: { teamId: team.id, name: "For sent", units: 2 } });
  await db.fine.create({ data: { teamId: team.id, playerId: anna.id, issuedById: treasurer.id, reason: "Glemte bolde", units: 1, unitPriceKr: 10 } });
  await loginAs(anna);
  await page.goto("/boder");
  const title = page.getByRole("heading", { level: 1 });
  const dot = (name: string) => page.getByRole("tab", { name });
  await expect(title).toHaveText("Bødekassen");
  await expect(dot("Bødekassen")).toHaveAttribute("aria-selected", "true");
  // Only the page shown is there to read and to tab through.
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByText("Hvad koster hvad.")).toBeHidden();

  // A finger dragged across the screen: real touch input, so the browser does the scrolling.
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (dx: number) => {
    const from = dx < 0 ? 350 : 60;
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y: 500 }] });
    await touch("touchStart", from);
    for (let step = 1; step <= 15; step++) await touch("touchMove", from + (dx * step) / 15);
    await touch("touchEnd");
  };

  await swipe(-290);
  await expect(title).toHaveText("Udfordringer");
  await expect(page).toHaveURL(/\/boder\/udfordringer$/);
  await expect(dot("Udfordringer")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Udfordring" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Giv bøde" })).toHaveCount(0);

  await swipe(-290);
  await expect(title).toHaveText("Bødekatalog");
  await expect(page).toHaveURL(/\/boder\/katalog$/);
  await expect(page.getByText("For sent")).toBeVisible();
  // The last page: there is nothing further to the right.
  await swipe(-290);
  await expect(title).toHaveText("Bødekatalog");

  await swipe(290);
  await expect(title).toHaveText("Udfordringer");

  // Without a finger: the dots, and the link on the board.
  await dot("Bødekassen").click();
  await expect(title).toHaveText("Bødekassen");
  await expect(page).toHaveURL(/\/boder$/);
  await page.getByRole("link", { name: /Udfordr dig ud af dem/ }).click();
  await expect(title).toHaveText("Udfordringer");
  await expect(page).toHaveURL(/\/boder\/udfordringer$/);
  await dot("Bødekatalog").click();
  await expect(title).toHaveText("Bødekatalog");

  // A reload stays on the page it was left on.
  await page.reload();
  await expect(title).toHaveText("Bødekatalog");
  await expect(dot("Bødekatalog")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("For sent")).toBeVisible();
});
