import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

const BOX_LINK = "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in";

test("a coach marks a player's kontingent paid, and the whole team sees it", async ({ page, loginAs }) => {
  const { team, admin, anna, bo } = await squad();
  await loginAs(admin);
  await page.goto("/hold/rettigheder");
  const paid = page.getByRole("checkbox", { name: "Kontingent betalt for Anna" });
  await expect(paid).toHaveAttribute("aria-checked", "false");
  await paid.click();
  await expect(paid).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(async () => (await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } })).duesPaidAt)
    .not.toBeNull();

  await expect(page.getByText("1/4 betalt")).toBeVisible();
  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByText("Kontingent betalt")).toBeVisible();
  await page.goto(`/spiller/${bo.id}`);
  await expect(page.getByText("Mangler kontingent")).toBeVisible();
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

  // Step 1: the box opens for payment, and Bo is marked paid right here.
  await shown.getByRole("button", { name: "Åbn for betaling" }).click();
  await page.getByRole("dialog", { name: /Åbn bødekassen for betaling\? 40 kr skal betales/ }).getByRole("button", { name: "Åbn for betaling" }).click();
  await expect(shown.getByText(/40 kr\.? mangler fra 2 spillere/)).toBeVisible();
  await shown.getByRole("listitem").filter({ hasText: "Bo" }).getByRole("button", { name: "Betalt" }).click();
  await page.getByRole("dialog", { name: /Har Bo betalt 10 kr/ }).getByRole("button", { name: "Markér som betalt" }).click();
  await expect(shown.getByText(/30 kr\.? mangler fra 1 spiller/)).toBeVisible();

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
  await expect(shown.getByText("heraf 30 kr ikke betalt", { exact: false })).toBeVisible();

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
  expect(await db.teamMember.count({ where: { teamId: team.id, finesPaidAt: { not: null } } })).toBe(0);
  expect((await db.team.findUniqueOrThrow({ where: { id: team.id } })).finePaymentOpenedAt).toBeNull();
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

test("an admin pastes the box's link, and a player's Betal opens MobilePay with the amount and the message filled in", async ({ page, loginAs }) => {
  const { team, admin, treasurer, anna } = await squad();
  await db.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "For sent", units: 3, unitPriceKr: 10, issuedById: treasurer.id } });

  // Without a box there is nothing to press.
  await loginAs(anna);
  await page.goto("/boder");
  await expect(page.getByRole("heading", { name: "Bødekassen" })).toBeVisible();
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByRole("heading", { name: "Anna", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Betal/ })).toHaveCount(0);

  await loginAs(admin);
  await page.goto("/hold/betaling");
  await page.getByLabel("Link til MobilePay Box").fill(`${BOX_LINK}?amount=30`);
  await page.getByLabel("Kontingent pr. sæson (kr)").fill("600");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  expect(await db.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({ mobilePayLink: BOX_LINK, duesKr: 600 });

  // MobilePay reads the amount in øre, and puts `message` in the payment's message.
  const fines = `${BOX_LINK}?amount=3000&message=B%C3%B8der%20%E2%80%93%20Anna`;
  const dues = `${BOX_LINK}?amount=60000&message=Kontingent%20%E2%80%93%20Anna`;

  // Fines are paid only once the box is open for payment; kontingent can be paid any time.
  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByRole("link", { name: "Betal kontingent (600 kr) ›" })).toHaveAttribute("href", dues);
  await expect(page.getByRole("link", { name: /Betal 30 kr/ })).toHaveCount(0);
  await db.team.update({ where: { id: team.id }, data: { finePaymentOpenedAt: new Date() } });

  // The fine box only says what you owe; paying is on your own page, where "Dine bøder" leads.
  await page.goto("/boder");
  await expect(page.getByRole("link", { name: /Dine bøder/ })).toContainText("Betal nu");
  await expect(page.locator('a[href^="https://qr.mobilepay.dk"]')).toHaveCount(0);

  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByRole("link", { name: "💸 Betal 30 kr med MobilePay" })).toHaveAttribute("href", fines);
  await expect(page.getByText(/markerer dig som betalt/)).toBeVisible();
  // Paying marks nothing: the fines stand until the treasurer marks them paid.
  expect((await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } })).finesPaidAt).toBeNull();

  // Once marked paid, kontingent asks no more; and nobody is asked to pay for somebody else.
  await db.teamMember.updateMany({ where: { teamId: team.id, userId: anna.id }, data: { duesPaidAt: new Date() } });
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByText("Kontingent betalt")).toBeVisible();
  await expect(page.getByRole("link", { name: /Betal kontingent/ })).toHaveCount(0);
  await page.goto(`/spiller/${treasurer.id}`);
  await expect(page.getByRole("heading", { name: "Kasserer Kim", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Betal/ })).toHaveCount(0);
});
