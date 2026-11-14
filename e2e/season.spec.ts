import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

const BOX_LINK = "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in";

test("a coach marks a player's kontingent paid, and the whole team sees it", async ({ page, loginAs }) => {
  const { team, admin, anna } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  const paid = page.getByRole("checkbox", { name: "Kontingent betalt for Anna" });
  await expect(paid).toHaveAttribute("aria-checked", "false");
  await paid.click();
  await expect(paid).toHaveAttribute("aria-checked", "true");
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

test("a coach goes through the season one step at a time, by swipe and by button, and starts the next", async ({ page, loginAs }) => {
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
  const tab = (name: string) => page.getByRole("tab", { name });
  const shown = page.getByRole("tabpanel");
  // The address changes once the row has come to rest on a step; mid-turn every step is
  // out to be swiped across, so ask which one is shown only after that.
  const at = async (slug: string, name: string) => {
    await expect(page).toHaveURL(new RegExp(`\\?trin=${slug}$`));
    await expect(tab(name)).toHaveAttribute("aria-selected", "true");
    await expect(shown).toHaveAccessibleName(name);
  };
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveAccessibleName("Bøder");

  // Step 1: Bo pays, and is reset right here.
  await expect(shown.getByText(/40 kr\.? står udestående hos 2 spillere/)).toBeVisible();
  await shown.getByRole("listitem").filter({ hasText: "Bo" }).getByRole("button", { name: "Nulstil" }).click();
  await page.getByRole("dialog", { name: "Nulstil Bos bøder?" }).getByRole("button", { name: "Nulstil" }).click();
  await expect(shown.getByText(/30 kr\.? står udestående hos 1 spiller/)).toBeVisible();

  // A finger across the screen turns the page, either way.
  const cdp = await page.context().newCDPSession(page);
  // Across the middle of the step shown, well inside the row that swipes.
  const swipe = async (dx: number) => {
    const from = dx < 0 ? 350 : 60;
    const box = (await shown.boundingBox())!;
    const y = box.y + Math.min(box.height / 2, 150);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y }] });
    await touch("touchStart", from);
    for (let step = 1; step <= 15; step++) await touch("touchMove", from + (dx * step) / 15);
    await touch("touchEnd");
  };
  await swipe(-290);
  await at("kampklar", "KampKlar");
  await expect(shown.getByText("1 afsluttet aktivitet slettes", { exact: false })).toBeVisible();
  await swipe(290);
  await at("boder", "Bøder");

  // Without a finger: Næste and Tilbage.
  await shown.getByRole("button", { name: "Næste" }).click();
  await at("kampklar", "KampKlar");
  await shown.getByRole("button", { name: "Næste" }).click();
  await at("spillere", "Spillere");
  await expect(shown.getByRole("listitem").filter({ hasText: "Anna" }).getByText("Kontingent betalt")).toBeVisible();
  await shown.getByRole("button", { name: "Tilbage" }).click();
  await at("kampklar", "KampKlar");
  await tab("Start").click();
  await at("start", "Start");
  await expect(shown.getByText("heraf 30 kr ikke nulstillet", { exact: false })).toBeVisible();

  // A reload stays on the step it was on.
  await page.reload();
  await at("start", "Start");

  await shown.getByLabel("Navn på sæsonen der slutter").fill("Sæson 2026");
  await shown.getByLabel("Jeg forstår, at det ikke kan fortrydes").check();
  await shown.getByRole("button", { name: "Start ny sæson" }).click();

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

test("an admin sets the MobilePay Box, and a player sees where and how much to pay for fines and kontingent", async ({ page, loginAs }) => {
  const { team, admin, treasurer, anna } = await squad();
  await db.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "For sent", units: 3, unitPriceKr: 10, issuedById: treasurer.id } });

  // Without a box there is nothing to press.
  await loginAs(anna);
  await page.goto("/boder");
  await expect(page.getByRole("heading", { name: "Bødekassen" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Betal dine bøder/ })).toHaveCount(0);

  await loginAs(admin);
  await page.goto("/hold");
  await page.getByLabel("MobilePay Box", { exact: true }).fill("9162tv");
  await page.getByLabel("Kontingent pr. sæson (kr)").fill("600");
  await page.getByLabel("Link til MobilePay Box").fill(`${BOX_LINK}?amount=30`);
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  expect(await db.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({ mobilePayBox: "9162TV", mobilePayLink: BOX_LINK, duesKr: 600 });

  await loginAs(anna);
  await page.goto("/boder");
  await page.getByRole("button", { name: /Betal dine bøder/ }).click();
  const fines = page.getByRole("dialog", { name: "Betal dine bøder" });
  await expect(fines.getByText("9162TV")).toBeVisible();
  await expect(fines.getByText("30 kr", { exact: true })).toBeVisible();
  await expect(fines.getByText("Bøder – Anna")).toBeVisible();
  // MobilePay reads the amount in øre.
  await expect(fines.getByRole("link", { name: "Åbn MobilePay med 30 kr" })).toHaveAttribute("href", `${BOX_LINK}?amount=3000`);
  await expect(fines.getByText(/nulstiller dine bøder/)).toBeVisible();
  await fines.getByRole("button", { name: "Luk" }).click();
  await expect(fines).toHaveCount(0);
  // Closing steps back off the sheet's history entry; the next page waits until it has.
  await expect.poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.swingkingsSheet ?? null)).toBeNull();
  // Paying marks nothing: the fine is outstanding until the treasurer resets it.
  expect(await db.fine.count({ where: { playerId: anna.id, clearedAt: null } })).toBe(1);

  await page.goto("/hold/spillere");
  await expect(page.getByText("Du mangler at betale kontingent (600 kr).")).toBeVisible();
  await page.getByRole("button", { name: "Betal", exact: true }).click();
  const dues = page.getByRole("dialog", { name: "Betal kontingent" });
  await expect(dues.getByText("600 kr", { exact: true })).toBeVisible();
  await expect(dues.getByText("Kontingent – Anna")).toBeVisible();
  await expect(dues.getByRole("link", { name: "Åbn MobilePay med 600 kr" })).toHaveAttribute("href", `${BOX_LINK}?amount=60000`);

  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByRole("button", { name: "💸 Betal 30 kr med MobilePay" })).toBeVisible();
  await page.getByRole("button", { name: "Betal kontingent ›" }).click();
  await expect(page.getByRole("dialog", { name: "Betal kontingent" }).getByText("9162TV")).toBeVisible();

  // Once marked paid, kontingent asks no more; and nobody is asked to pay for somebody else.
  await db.teamMember.updateMany({ where: { teamId: team.id, userId: anna.id }, data: { duesPaidAt: new Date() } });
  await page.goto("/hold/spillere");
  await expect(page.getByText(/Du mangler at betale kontingent/)).toHaveCount(0);
  await page.goto(`/spiller/${treasurer.id}`);
  await expect(page.getByRole("button", { name: /Betal/ })).toHaveCount(0);
});
