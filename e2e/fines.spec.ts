import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";
import type { Page } from "@playwright/test";
import { choose, openChoices } from "./helpers/select";

/** The fine box's "+": a drawer of what can be made there, and then one of them. */
async function create(page: Page, name: string) {
  await page.getByRole("button", { name: "Opret" }).click();
  await page
    .getByRole("dialog", { name: "Opret" })
    .getByRole("button", { name })
    .click();
}

test("the catalogue drop-down searches its choices, and Escape closes it and not the dialog", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.fineType.createMany({
    data: [
      { teamId: team.id, name: "For sent", units: 2 },
      { teamId: team.id, name: "Glemte benskinner", units: 1 },
      { teamId: team.id, name: "Rødt kort", units: 5 },
    ],
  });
  await loginAs(anna);
  await page.goto("/boder");
  await create(page, "Giv bøde");
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  const field = dialog.getByLabel("Bøde fra kataloget");
  // Not the browser's own <select>, but the app's, with a search field.
  await expect(field).toHaveRole("combobox");
  await expect(field).toHaveText("Skriv selv…");

  const list = await openChoices(field);
  await expect(list).toHaveAccessibleName("Bøde fra kataloget");
  await expect(list.getByRole("option")).toHaveCount(4);
  const search = page.getByRole("searchbox", { name: "Søg" });
  await search.fill("BENSKIN");
  await expect(list.getByRole("option")).toHaveText(["Glemte benskinner (1 bøde)"]);
  await search.fill("rød");
  await expect(list.getByRole("option")).toHaveText(["Rødt kort (5 bøder)"]);
  await search.fill("ingenting");
  await expect(list.getByRole("option")).toHaveCount(0);
  await expect(list.getByText("Ingen match")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(field).toHaveText("Skriv selv…");

  // The keyboard: type, then Enter takes the first that answers.
  await openChoices(field);
  await search.fill("kort");
  await search.press("Enter");
  await expect(field).toHaveText("Rødt kort (5 bøder)");
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByLabel("Hvad er bøden for?")).toHaveCount(0);
  await expect(dialog.getByText("I alt 50 kr pr. spiller.")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Anna" }).check();
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => db.fine.count({ where: { playerId: anna.id, units: 5, reason: "Rødt kort" } })).toBe(1);
});

test("a required drop-down left on its placeholder stops the form", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  await create(page, "Meld udfordring");
  const dialog = page.getByRole("dialog", { name: "Meld en udfordring" });
  await expect(dialog.getByLabel("Hvem spillede du mod?")).toHaveText("Vælg spiller…");
  await dialog.getByLabel("Hvad gik udfordringen ud på?").fill("Overliggeren");
  await dialog.getByRole("button", { name: "Send til godkendelse" }).click();
  // The browser refuses the empty choice; nothing is sent and the dialog stays.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Hvem spillede du mod?")).toBeFocused();
  expect(await db.challenge.count()).toBe(0);
});

test("a treasurer gives two players a catalogue fine, and the board and their accounts show it", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna, bo } = await squad();
  await db.fineType.create({
    data: { teamId: team.id, name: "For sent", units: 2 },
  });
  await loginAs(treasurer);
  await page.goto("/boder");

  await create(page, "Giv bøde");
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await dialog.getByRole("checkbox", { name: "Anna" }).check();
  await dialog.getByRole("checkbox", { name: "Bo" }).check();
  await choose(dialog.getByLabel("Bøde fra kataloget"), "For sent (2 bøder)", { search: "sent" });
  await expect(dialog.getByText("I alt 20 kr pr. spiller.")).toBeVisible();
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("link", { name: /Anna .*20 kr/ })).toBeVisible();
  expect(
    await db.fine.count({
      where: { playerId: { in: [anna.id, bo.id] }, units: 2, unitPriceKr: 10 },
    }),
  ).toBe(2);

  await loginAs(anna);
  await page.goto("/oversigt");
  // The card's own text, so a failure says what it showed instead of "not found".
  const account = page
    .locator('a[href="/boder"]')
    .filter({ hasText: /^Bødekonto/i });
  await expect(account).toContainText("20 kr");
  await expect(account).toContainText("i bøder");
});

test("a refused fine keeps the dialog open and says why", async ({
  page,
  loginAs,
}) => {
  const { treasurer } = await squad();
  await loginAs(treasurer);
  await page.goto("/boder");
  await create(page, "Giv bøde");
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog.getByText("Vælg mindst én spiller.")).toBeVisible();
  await expect(dialog).toBeVisible();
});

test("a player gives a teammate a fine", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  await create(page, "Giv bøde");
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await dialog.getByRole("checkbox", { name: "Bo" }).check();
  await dialog.getByLabel("Hvad er bøden for?").fill("Glemte benskinner");
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog).toBeHidden();
  expect(await db.fine.findFirst({ where: { playerId: bo.id } })).toMatchObject(
    { issuedById: anna.id, reason: "Glemte benskinner" },
  );
});

test("a player sees the catalogue but cannot change it", async ({
  page,
  loginAs,
}) => {
  const { team, anna } = await squad();
  await db.fineType.create({
    data: { teamId: team.id, name: "For sent", units: 2 },
  });
  await loginAs(anna);
  await page.goto("/boder/katalog");
  await expect(page.getByText("For sent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ny bøde" })).toHaveCount(0);
  // Nor is it in the "+": only who manages the fines makes one.
  await page.getByRole("button", { name: "Opret" }).click();
  const menu = page.getByRole("dialog", { name: "Opret" });
  await expect(menu.getByRole("button", { name: "Giv bøde" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Ny bøde i kataloget" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  // The fine is a row to read, not a button: nothing opens it.
  await expect(page.getByRole("button", { name: /For sent/ })).toHaveCount(0);
  await page.getByText("For sent").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a treasurer taps a fine in the catalogue to change it, and deletes it from the same dialog", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer } = await squad();
  const type = await db.fineType.create({
    data: { teamId: team.id, name: "For sent", units: 2 },
  });
  await loginAs(treasurer);
  await page.goto("/boder/katalog");
  const panel = page.getByRole("tabpanel");
  // The row is the only way in: no "⋯" beside it.
  await expect(panel.getByRole("button", { name: /Handlinger/ })).toHaveCount(
    0,
  );
  await panel.getByRole("button", { name: /For sent/ }).click();
  const dialog = page.getByRole("dialog", { name: "Ret bøde" });
  await expect(dialog.getByLabel("Navn")).toHaveValue("For sent");
  await dialog.getByLabel("Navn").fill("Alt for sent");
  await dialog.getByLabel("Antal bøder").fill("3");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    panel.getByRole("button", { name: /Alt for sent.*3 bøder.*30 kr/ }),
  ).toBeVisible();
  expect(
    await db.fineType.findUniqueOrThrow({ where: { id: type.id } }),
  ).toMatchObject({ name: "Alt for sent", units: 3 });

  // Deleting asks first, and going ahead deletes — it does not also save what is in the form.
  await panel.getByRole("button", { name: /Alt for sent/ }).click();
  await dialog.getByLabel("Navn").fill("Må ikke gemmes");
  await dialog.getByRole("button", { name: "Slet fra kataloget" }).click();
  const confirm = page.getByRole("dialog", {
    name: "Slet “Alt for sent” fra kataloget?",
  });
  await confirm.getByRole("button", { name: "Annuller" }).click();
  await expect(confirm).toBeHidden();
  expect(
    await db.fineType.findUniqueOrThrow({ where: { id: type.id } }),
  ).toMatchObject({ name: "Alt for sent" });
  await dialog.getByRole("button", { name: "Slet fra kataloget" }).click();
  await confirm.getByRole("button", { name: "Slet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(panel.getByText("Alt for sent")).toHaveCount(0);
  expect(await db.fineType.count({ where: { teamId: team.id } })).toBe(0);
});

test("a treasurer and an admin add to the catalogue from the +, not from the list", async ({ page, loginAs }) => {
  const { team, treasurer, admin } = await squad();
  await loginAs(treasurer);
  await page.goto("/boder/katalog");
  // The list has no row of its own for making one.
  await expect(page.getByRole("tabpanel").getByRole("button", { name: "Ny bøde" })).toHaveCount(0);
  await create(page, "Ny bøde i kataloget");
  const dialog = page.getByRole("dialog", { name: "Ny bøde i kataloget" });
  await dialog.getByLabel("Navn").fill("Rødt kort");
  await dialog.getByLabel("Antal bøder").fill("10");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Rødt kort")).toBeVisible();
  await expect(page.getByText("100 kr")).toBeVisible();
  const rows = page.getByRole("tabpanel").getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Rødt kort");
  expect(await db.fineType.count({ where: { teamId: team.id } })).toBe(1);

  await loginAs(admin);
  await page.goto("/boder");
  await create(page, "Ny bøde i kataloget");
  await expect(page.getByRole("dialog", { name: "Ny bøde i kataloget" })).toBeVisible();
});

test("a challenge is reported, approved in the sheet by a third player, and the stake moves to the loser", async ({
  page,
  loginAs,
}) => {
  const { team, admin, anna, bo } = await squad();
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      reason: "For sent",
      units: 5,
      unitPriceKr: 10,
      issuedById: admin.id,
    },
  });
  await loginAs(anna);
  await page.goto("/boder");
  await create(page, "Meld udfordring");
  const dialog = page.getByRole("dialog", { name: "Meld en udfordring" });
  await choose(dialog.getByLabel("Hvem spillede du mod?"), "Bo");
  await choose(dialog.getByLabel("Hvem vandt?"), "Jeg vandt");
  await dialog
    .getByLabel("Hvad gik udfordringen ud på?")
    .fill("Flest mål på træning");
  await dialog.getByLabel("Indsats (antal bøder)").fill("3");
  await dialog.getByRole("button", { name: "Send til godkendelse" }).click();
  await expect(dialog).toBeHidden();

  // The reporter sees it waiting in the sheet, but may not approve it.
  await page
    .getByRole("button", { name: /Udfordringer.*1 venter på godkendelse/ })
    .click();
  const sheet = page.getByRole("dialog", { name: "Udfordringer" });
  await expect(
    sheet.getByText("Venter på at en anden på holdet godkender."),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Godkend" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Luk" }).click();
  await expect(sheet).toBeHidden();

  // The notification's old link lands on the fine box with the sheet already open.
  await loginAs(admin);
  await page.goto("/boder/udfordringer");
  await expect(page).toHaveURL(/\/boder\?udfordringer$/);
  await expect(
    sheet.getByRole("heading", { name: "Venter på din godkendelse" }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Godkend" }).click();
  // The sheet stays open, but holds only what waits: the settled one has left it.
  await expect(sheet.getByText("Ingen udfordringer venter.")).toBeVisible();
  await expect(sheet.getByText(/flyttet fra Anna til Bo/)).toHaveCount(0);
  await sheet.getByRole("button", { name: "Luk" }).click();
  // Closed, it does not open again on a reload, and with none waiting the overview says nothing of challenges.
  await expect(page).toHaveURL(/\/boder$/);
  await expect(page.getByRole("button", { name: /Udfordringer/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Bo .*30 kr/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Anna .*20 kr/ })).toBeVisible();
  expect(
    await db.fine.count({
      where: { playerId: bo.id, units: 3, challengeId: { not: null } },
    }),
  ).toBe(1);

  // The settled challenge is found in the history, marked as one.
  await page.goto("/boder/historik");
  const lost = page.getByRole("button", { name: /Bo · Tabt udfordring/ });
  await expect(lost.getByText("Udfordring", { exact: true })).toHaveCount(1);
  await lost.click();
  await expect(
    page
      .getByRole("dialog", { name: "Udfordring" })
      .getByText(/3 bøder flyttet fra Anna til Bo · godkendt af/),
  ).toBeVisible();
});

test("a challenge is reported from inside the challenges' sheet and lands in it", async ({
  page,
  loginAs,
}) => {
  const { team, admin, anna, bo } = await squad();
  await db.challenge.create({
    data: {
      teamId: team.id,
      winnerId: bo.id,
      loserId: admin.id,
      reportedById: bo.id,
      description: "Flest mål",
      units: 1,
    },
  });
  // The winner needs fines to win their way out of.
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: bo.id,
      reason: "For sent",
      units: 2,
      unitPriceKr: 10,
      issuedById: admin.id,
    },
  });
  await loginAs(anna);
  await page.goto("/boder?udfordringer");
  const sheet = page.getByRole("dialog", { name: "Udfordringer" });
  await sheet.getByRole("button", { name: "Meld udfordring" }).click();
  const dialog = page.getByRole("dialog", { name: "Meld en udfordring" });
  await choose(dialog.getByLabel("Hvem spillede du mod?"), "Bo");
  await choose(dialog.getByLabel("Hvem vandt?"), "Min modstander vandt");
  await dialog
    .getByLabel("Hvad gik udfordringen ud på?")
    .fill("Straffesparkskonkurrence");
  await dialog.getByRole("button", { name: "Send til godkendelse" }).click();
  await expect(dialog).toBeHidden();

  // The sheet is still open behind it, and now holds the new one too, waiting on somebody else.
  await expect(sheet.getByText("“Straffesparkskonkurrence”")).toBeVisible();
  await expect(sheet.getByText("“Flest mål”")).toBeVisible();
  expect(
    await db.challenge.count({
      where: {
        teamId: team.id,
        reportedById: anna.id,
        winnerId: bo.id,
        loserId: anna.id,
      },
    }),
  ).toBe(1);
});

test("a fine in the history opens with what it was for, who gave it and when, and a challenge's fine shows the challenge", async ({
  page,
  loginAs,
}) => {
  const { team, admin, treasurer, anna, bo } = await squad();
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      reason: "For sent",
      note: "Ti minutter efter fløjt",
      units: 5,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    },
  });
  const challenge = await db.challenge.create({
    data: {
      teamId: team.id,
      reportedById: anna.id,
      winnerId: anna.id,
      loserId: bo.id,
      description: "Flest mål",
      units: 2,
      status: "SETTLED",
      approvedById: admin.id,
      settledAt: new Date(),
    },
  });
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: bo.id,
      reason: "Udfordring tabt: Flest mål",
      units: 2,
      unitPriceKr: 10,
      issuedById: admin.id,
      challengeId: challenge.id,
    },
  });
  await loginAs(anna);
  await page.goto("/boder/historik");

  // Every row's icon says which it is: a fine given, or a challenge's — and names it for a screen reader.
  await expect(
    page
      .getByRole("button", { name: /Anna · For sent/ })
      .getByText("Bøde", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("button", { name: /Anna · For sent/ })
      .getByText("Udfordring", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: /Bo · Udfordring tabt/ })
      .getByText("Udfordring", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("button", { name: /Bo · Udfordring tabt/ })
      .getByText("Bøde", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /Anna · For sent/ }).click();
  const fine = page.getByRole("dialog", { name: "Bøde" });
  await expect(fine.getByText("Ti minutter efter fløjt")).toBeVisible();
  await expect(fine.getByText("Kasserer Kim")).toBeVisible();
  await expect(fine.getByText("Pris pr. bøde")).toBeVisible();
  // Anna gave neither fine, and is no treasurer.
  await expect(fine.getByRole("button", { name: "Slet bøden" })).toHaveCount(0);
  await fine.getByRole("button", { name: "Luk" }).click();
  await expect(fine).toBeHidden();

  await page.getByRole("button", { name: /Bo · Udfordring tabt/ }).click();
  const sheet = page.getByRole("dialog", { name: "Udfordring" });
  await expect(sheet.getByText("“Flest mål”")).toBeVisible();
  await expect(
    sheet.getByText(/2 bøder flyttet fra Anna til Bo · godkendt af Træner/),
  ).toBeVisible();
  // One card tells it all: the fine's own facts sit under the challenge, not repeated beside it.
  await expect(sheet.getByText("Hvornår")).toBeVisible();
  await expect(sheet.getByText("Pris pr. bøde")).toHaveCount(0);
  await expect(sheet.getByText("Givet af")).toHaveCount(0);
  await expect(sheet.getByText("Udfordringen", { exact: true })).toHaveCount(0);
});

test("an admin opens the box for payment: no new fines, Betal for the player, and the treasurer marks it paid", async ({
  page,
  loginAs,
}) => {
  const { team, admin, treasurer, anna } = await squad();
  await db.team.update({
    where: { id: team.id },
    data: { mobilePayLink: "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in" },
  });
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      reason: "For sent",
      units: 4,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    },
  });
  // Before the box is open nobody pays and nobody is marked paid: the fines just stand.
  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByText("bøder i alt")).toBeVisible();
  await expect(page.getByRole("link", { name: /Betal 40 kr/ })).toHaveCount(0);
  await loginAs(treasurer);
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByRole("button", { name: /som betalt/ })).toHaveCount(0);

  await loginAs(admin);
  await page.goto("/hold/betaling");
  await page.getByRole("button", { name: "Åbn for betaling" }).click();
  await page
    .getByRole("dialog", { name: /Åbn bødekassen for betaling/ })
    .getByRole("button", { name: "Åbn for betaling" })
    .click();
  await expect(page.getByText("Åben for betaling", { exact: true })).toBeVisible();

  // Open, the box gives no new fines, and Anna is asked to pay all of hers.
  await loginAs(anna);
  await page.goto("/boder");
  await expect(page.getByRole("status")).toContainText("Bødekassen er åben for betaling.");
  await expect(page.getByRole("button", { name: "Opret" })).toHaveCount(0);
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByText("skal betales")).toBeVisible();
  await expect(page.getByRole("link", { name: "💸 Betal 40 kr med MobilePay" })).toBeVisible();
  // Nor does a person's page: with no activity coming either, it has no "+" at all.
  await expect(page.getByRole("button", { name: "Opret" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /som betalt/ })).toHaveCount(0);

  await loginAs(treasurer);
  await page.goto(`/spiller/${anna.id}`);
  await page.getByRole("button", { name: "Markér 40 kr som betalt" }).click();
  await expect(page.getByText("✅ Bøderne er betalt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fortryd betalt" })).toBeVisible();
  expect(
    (await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } })).finesPaidAt,
  ).toBeInstanceOf(Date);
  // The fine itself is as it was.
  expect(await db.fine.count({ where: { playerId: anna.id } })).toBe(1);

  await loginAs(anna);
  await page.goto("/boder");
  await expect(page.getByRole("link", { name: /Anna .*Betalt/ })).toBeVisible();
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByRole("link", { name: /Betal 40 kr/ })).toHaveCount(0);
});

test("the overview stays on top: what you owe, what is in the box and the way to the challenges", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna, bo } = await squad();
  const give = (playerId: string, reason: string) =>
    db.fine.create({
      data: {
        teamId: team.id,
        playerId,
        issuedById: treasurer.id,
        reason,
        units: 1,
        unitPriceKr: 10,
      },
    });
  await give(anna.id, "Glemte bolde");
  for (let n = 1; n <= 4; n++) await give(bo.id, `Bøde nummer ${n}`);

  await loginAs(anna);
  await page.goto("/boder");
  // Five fines given: 50 kr in the box, paid when the season is over, 10 of them Anna's.
  const mine = page.getByRole("link", { name: /Dine bøder/ });
  await expect(mine).toContainText("10 kr");
  await expect(mine).toContainText("1 bøde");
  const box = page.getByText("I kassen").locator("..");
  await expect(box).toContainText("50 kr");
  await expect(box).toContainText("betales ved sæsonslut");
  // A row on the board opens the player's page, and says so at its end as the history's rows do.
  await expect(page.getByRole("link", { name: /Bo .*40 kr/ })).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: /Bo .*40 kr/ })
      .locator("[aria-hidden]")
      .last(),
  ).toHaveText("›");
  // With no challenge waiting, the overview says nothing of them.
  const challenges = page.getByRole("button", { name: /Udfordringer/ });
  await expect(challenges).toHaveCount(0);

  // A challenge between two others waits on Anna, and the overview says so on every page under it.
  await db.challenge.create({
    data: {
      teamId: team.id,
      winnerId: bo.id,
      loserId: treasurer.id,
      reportedById: bo.id,
      description: "Flest mål",
      units: 1,
    },
  });
  await page.goto("/boder/katalog");
  await expect(mine).toContainText("10 kr");
  await expect(challenges).toContainText("1 venter på godkendelse");
  await expect(challenges).toContainText("1 på dig");
  await challenges.click();
  const sheet = page.getByRole("dialog", { name: "Udfordringer" });
  await expect(
    sheet.getByRole("heading", { name: "Venter på din godkendelse" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/boder\/katalog$/);
  await sheet.getByRole("button", { name: "Luk" }).click();
  await expect(sheet).toBeHidden();

  await mine.click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
});

test("the history lists the team's fines and lets whoever gave one take it back", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna, bo } = await squad();
  const other = await squad("Andre");
  await loginAs(anna);
  await page.goto("/boder/historik");
  await expect(page.getByRole("tab", { name: "Historik" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Ingen bøder endnu.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Dine bøder/ })).toContainText(
    "Ren tavle",
  );

  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      issuedById: treasurer.id,
      reason: "Kassererens bøde",
      units: 1,
      unitPriceKr: 10,
    },
  });
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: bo.id,
      issuedById: anna.id,
      reason: "Glemte bolde",
      units: 1,
      unitPriceKr: 10,
    },
  });
  await db.fine.create({
    data: {
      teamId: other.team.id,
      playerId: other.anna.id,
      issuedById: other.treasurer.id,
      reason: "De andres bøde",
      units: 1,
      unitPriceKr: 10,
    },
  });
  await page.goto("/boder/historik");
  await expect(page.getByText("Kassererens bøde")).toBeVisible();
  await expect(page.getByText("De andres bøde")).toHaveCount(0);
  // Only the fine Anna gave is hers to delete: the treasurer's opens without the button.
  await page.getByRole("button", { name: /Anna · Kassererens bøde/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Bøde" }).getByText("Kassererens bøde"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Slet bøden" })).toHaveCount(0);
  await page
    .getByRole("dialog", { name: "Bøde" })
    .getByRole("button", { name: "Luk" })
    .click();
  await page.getByRole("button", { name: /Bo · Glemte bolde/ }).click();
  await page
    .getByRole("dialog", { name: "Bøde" })
    .getByRole("button", { name: "Slet bøden" })
    .click();
  await page
    .getByRole("dialog", { name: "Slet bøden til Bo?" })
    .getByRole("button", { name: "Slet bøden" })
    .click();
  await expect(page.getByText("Glemte bolde")).toHaveCount(0);
  await expect(page.getByText("Kassererens bøde")).toBeVisible();
  expect(await db.fine.count({ where: { teamId: team.id } })).toBe(1);
});

test("the board, the history and the catalogue are swiped between under the overview", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna } = await squad();
  await db.fineType.create({
    data: { teamId: team.id, name: "For sent", units: 2 },
  });
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      issuedById: treasurer.id,
      reason: "Glemte bolde",
      units: 1,
      unitPriceKr: 10,
    },
  });
  await loginAs(treasurer);
  await page.goto("/boder");
  const tab = (name: string) => page.getByRole("tab", { name });
  const shown = page.getByRole("tabpanel");
  const overview = page.getByRole("link", { name: /Dine bøder/ });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Bødekassen",
  );
  await expect(tab("Bødetavlen")).toHaveAttribute("aria-selected", "true");
  // Only the page shown is there to read and to tab through.
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveAccessibleName("Bødetavlen");
  await expect(page.getByRole("button", { name: "Ny bøde" })).toBeHidden();

  // A finger dragged across the screen: real touch input, so the browser does the scrolling.
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (dx: number, y = 600) => {
    const from = dx < 0 ? 350 : 60;
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: x === undefined ? [] : [{ x, y }],
      });
    await touch("touchStart", from);
    for (let step = 1; step <= 15; step++)
      await touch("touchMove", from + (dx * step) / 15);
    await touch("touchEnd");
  };

  // The overview is not part of the swipe: a drag across it moves nothing.
  const tile = (await overview.boundingBox())!;
  await swipe(-290, tile.y + tile.height / 2);
  await expect(
    page.getByRole("link", { name: /Anna .*10 kr/ }),
  ).toBeInViewport();
  await expect(tab("Bødetavlen")).toHaveAttribute("aria-selected", "true");

  // The names keep up with the finger: past half way, with the finger still down, the
  // name has changed and the underline is on its way.
  const underline = page.getByRole("tablist").locator("span");
  const from = (await underline.boundingBox())!.x;
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: x === undefined ? [] : [{ x, y: 600 }],
    });
  await touch("touchStart", 380);
  for (let x = 360; x >= 100; x -= 20) await touch("touchMove", x);
  await expect(tab("Historik")).toHaveAttribute("aria-selected", "true");
  expect((await underline.boundingBox())!.x).toBeGreaterThan(from);
  expect((await underline.boundingBox())!.x).toBeLessThan(
    (await tab("Historik").boundingBox())!.x,
  );
  await expect(page).toHaveURL(/\/boder$/);
  await touch("touchEnd");
  await expect(page).toHaveURL(/\/boder\/historik$/);
  const under = (await tab("Historik").boundingBox())!;
  await expect
    .poll(async () => (await underline.boundingBox())!.x)
    .toBeCloseTo(under.x, 0);
  expect((await underline.boundingBox())!.width).toBeCloseTo(under.width, 0);
  await expect(shown).toHaveAccessibleName("Historik");
  await expect(page.getByText("Glemte bolde")).toBeVisible();
  // The title, the button and the overview stay where they were.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Bødekassen",
  );
  await expect(page.getByRole("button", { name: "Opret" })).toBeVisible();
  await expect(overview).toBeInViewport();

  await swipe(-290);
  await expect(tab("Katalog")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/boder\/katalog$/);
  await expect(page.getByText("For sent")).toBeVisible();
  // Making a new one is in the "+", not a row of the list.
  await expect(page.getByRole("tabpanel").getByRole("button", { name: "Ny bøde" })).toHaveCount(0);
  // The last page: there is nothing further to the right.
  await swipe(-290);
  await expect(tab("Katalog")).toHaveAttribute("aria-selected", "true");

  await swipe(290);
  await expect(tab("Historik")).toHaveAttribute("aria-selected", "true");

  // Without a finger: the names.
  await tab("Bødetavlen").click();
  await expect(tab("Bødetavlen")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/boder$/);
  await tab("Katalog").click();
  await expect(page).toHaveURL(/\/boder\/katalog$/);
  await expect(shown).toHaveAccessibleName("Katalog");

  // A reload stays on the page it was left on.
  await page.reload();
  await expect(tab("Katalog")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("For sent")).toBeVisible();
});

test("a finger scrolling up and down the board leaves the page its own height; one going sideways still swipes", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna } = await squad();
  // A long history beside a short board: shown, it would make the page much taller.
  await db.fine.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      teamId: team.id,
      playerId: anna.id,
      reason: `Bøde ${i + 1}`,
      units: 1,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    })),
  });
  await loginAs(anna);
  await page.goto("/boder");
  await expect(page.getByRole("button", { name: "Opret" })).toBeVisible();
  const tall = () => page.evaluate(() => document.documentElement.scrollHeight);
  const before = await tall();

  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    x?: number,
    y?: number,
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: x === undefined ? [] : [{ x, y: y! }],
    });

  // Up and down on the board, held: the neighbours stay put away, so the page is no taller.
  const start = (await page.getByRole("tabpanel").boundingBox())!;
  const top = Math.round(start.y + start.height - 10);
  await touch("touchStart", 200, top);
  for (let step = 1; step <= 10; step++)
    await touch("touchMove", 200, top - step * 20);
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  expect(await tall()).toBe(before);
  await touch("touchEnd");

  // Sideways, on the board wherever the scroll left it: the history comes along with the finger.
  const board = (await page.getByRole("tabpanel").boundingBox())!;
  const y = Math.round(board.y + board.height / 2);
  await touch("touchStart", 350, y);
  for (let step = 1; step <= 15; step++)
    await touch("touchMove", 350 - step * 20, y);
  await touch("touchEnd");
  await expect(page).toHaveURL(/\/boder\/historik$/);
  await expect(page.getByText("Bøde 40")).toBeVisible();
});

test("a short page beside a long history ends where its own content does", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna } = await squad();
  await db.fine.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      teamId: team.id,
      playerId: anna.id,
      reason: `Bøde ${i + 1}`,
      units: 1,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    })),
  });
  await loginAs(anna);
  // The document is the page: nothing put away beside it reaches below the body, where
  // a scroll would show only the frame's colour.
  const beyond = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollHeight -
        Math.round(document.body.getBoundingClientRect().height),
    );
  const tab = (name: string) => page.getByRole("tab", { name });

  await page.goto("/boder");
  await expect(tab("Bødetavlen")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  expect(await beyond()).toBe(0);

  // Through the history and on to the catalogue, which is short again.
  await tab("Historik").click();
  await expect(page).toHaveURL(/\/boder\/historik$/);
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  const long = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(await beyond()).toBe(0);

  await tab("Katalog").click();
  await expect(page).toHaveURL(/\/boder\/katalog$/);
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  expect(await beyond()).toBe(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThan(long);

  // A reload on the short page is no taller either.
  await page.reload();
  await expect(tab("Katalog")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  expect(await beyond()).toBe(0);
});
