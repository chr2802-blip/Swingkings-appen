import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("the front door sends the signed-in to the overview and everyone else to login", async ({ page, loginAs }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/");
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("an old feed link lands on the feed on the front page", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/oversigt#feed$/);
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
});

test("somebody on no team is told to ask for an invitation", async ({ page, loginAs }) => {
  const loner = await db.user.create({ data: { email: "alene@e2e.dk", name: "Alene", passwordHash: "x" } });
  await loginAs(loner);
  await page.goto("/hold/vaelg");
  await expect(page.getByText(/Du er ikke på et hold endnu/)).toBeVisible();
});

test("a player's page lists their fines with what each cost", async ({ page, loginAs }) => {
  const { team, treasurer, anna } = await squad();
  await db.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "Glemt benskinner", units: 3, unitPriceKr: 10, issuedById: treasurer.id } });
  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}`);
  await expect(page.getByText("Glemt benskinner")).toBeVisible();
  await expect(page.getByText("30 kr").first()).toBeVisible();
});

test("a player's page from another team is not found", async ({ page, loginAs }) => {
  const { anna } = await squad();
  const other = await squad("Naboerne");
  await loginAs(anna);
  const response = await page.goto(`/spiller/${other.bo.id}`);
  expect(response?.status()).toBe(404);
});

test("a super admin creates a team and becomes its coach; nobody else reaches the admin page", async ({ page, loginAs }) => {
  const root = await db.user.create({ data: { email: "root@e2e.dk", name: "Root", passwordHash: "x", role: "SUPER_ADMIN" } });
  await loginAs(root);
  await page.goto("/admin");
  await page.getByLabel("Holdets navn").fill("Nyt hold");
  await page.getByRole("button", { name: "Opret hold" }).click();
  await expect(page.getByText("Nyt hold er oprettet, og du er træner på det.")).toBeVisible();
  expect(await db.teamMember.findFirst({ where: { userId: root.id, team: { name: "Nyt hold" } } })).toMatchObject({ role: "ADMIN" });

  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("a super admin makes the test team, lands on it, and takes it away again", async ({ page, loginAs }) => {
  const root = await db.user.create({ data: { email: "root@e2e.dk", name: "Root", passwordHash: "x", role: "SUPER_ADMIN" } });
  await loginAs(root);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Opret testhold" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Opret testhold" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Swingkings Demo" })).toBeVisible();
  expect(await db.teamMember.findFirst({ where: { userId: root.id, team: { name: "Swingkings Demo" } } })).toMatchObject({ role: "ADMIN" });

  await page.goto("/chat");
  await expect(page.getByText("Husk mødetid 13:45 på lørdag! 💪")).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Slet testhold" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Slet testholdet" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Swingkings Demo" })).toBeHidden();
  expect(await db.team.count({ where: { name: "Swingkings Demo" } })).toBe(0);
  expect(await db.user.count({ where: { email: { endsWith: "@demo.swingkings.dk" } } })).toBe(0);
});

/** Where the tab stands in its history — Chromium's Navigation API, which the suite runs on. */
const historyIndex = (page: Page) =>
  page.evaluate(() => (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index);

test("browser back closes the dialog and stays on the page behind it", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("link", { name: "Aktiviteter" }).first().click();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  const before = await historyIndex(page);

  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny aktivitet" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => historyIndex(page)).toBe(before + 1);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  expect(await historyIndex(page)).toBe(before);

  expect(await page.evaluate(() => history.scrollRestoration)).toBe("auto");

  // Closed by its own button, the dialog takes its history step with it: one back leaves the page.
  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  await expect.poll(() => historyIndex(page)).toBe(before + 1);
  await dialog.getByRole("button", { name: "Annuller" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => historyIndex(page)).toBe(before);
  await page.goBack();
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("a drawer and the dialog it opens share one history step, and a saved form leaves none", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: new Date(Date.now() + 3 * 86_400_000) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  const before = await historyIndex(page);

  await page.getByRole("button", { name: "Handlinger" }).click();
  const menu = page.getByRole("dialog", { name: "Handlinger" });
  await menu.getByRole("button", { name: "Ny opgave" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny opgave" });
  await expect(dialog).toBeVisible();
  await expect(menu).toBeHidden();
  await expect.poll(() => historyIndex(page)).toBe(before + 1);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(menu).toBeHidden();
  expect(await historyIndex(page)).toBe(before);

  // The action replaces the history entry's state on its way; the step still goes when the dialog does.
  await page.getByRole("button", { name: "Handlinger" }).click();
  await menu.getByRole("button", { name: "Ny opgave" }).click();
  await dialog.getByLabel("Opgave").fill("Købe nye bolde");
  await dialog.getByRole("button", { name: "Opret opgave" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Købe nye bolde")).toBeVisible();
  await expect.poll(() => historyIndex(page)).toBe(before);
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}$`));
});

test("a form that moves on to a new page leaves the browser's history alone", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const before = await historyIndex(page);
  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny aktivitet" });
  await dialog.getByLabel("Navn").fill("Afslutningsfest");
  await dialog.getByLabel("Starter").fill("2031-06-01T18:00");
  await dialog.getByRole("button", { name: "Gem aktivitet" }).click();
  await expect(page.getByRole("heading", { name: "Afslutningsfest", level: 1 })).toBeVisible();
  // The dialog went with the page it was on; nothing may step back off the new one.
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/aktiviteter\/\w+$/);
  expect(await historyIndex(page)).toBeGreaterThan(before);
  await page.goBack();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(dialog).toBeHidden();
});

test("a tab's page comes in from the side the tab is on, and a page inside a tab opens", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: new Date(Date.now() + 3 * 86_400_000) } });
  await loginAs(anna);
  await page.goto("/boder");
  const shown = page.getByTestId("page");
  const tabs = page.getByRole("navigation").last();
  await expect(shown).toHaveAttribute("data-motion", "first");

  await tabs.getByRole("link", { name: "Aktiviteter" }).click();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).toHaveAttribute("data-motion", "forward");
  expect(await shown.evaluate((el) => getComputedStyle(el).animationName)).toBe("page-forward");

  await page.getByRole("link", { name: /Afslutningsfest/ }).click();
  await expect(page.getByRole("heading", { name: "Afslutningsfest", level: 1 })).toBeVisible();
  await expect(shown).toHaveAttribute("data-motion", "open");

  await tabs.getByRole("link", { name: "Bøder" }).click();
  await expect(page).toHaveURL(/\/boder$/);
  await expect(shown).toHaveAttribute("data-motion", "backward");

  // Once in, the page is itself again: nothing is left on it for a fixed child to hang from.
  await expect.poll(() => shown.evaluate((el) => el.getAnimations().length)).toBe(0);
  expect(await shown.evaluate((el) => [getComputedStyle(el).translate, getComputedStyle(el).opacity])).toEqual(["none", "1"]);
});

test("back, and a swipe between the fine box's pages, bring nothing in", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const shown = page.getByTestId("page");
  await page.getByRole("navigation").last().getByRole("link", { name: "Bøder" }).click();
  await expect(shown).toHaveAttribute("data-motion", "backward");

  // The page was already there, beside the one shown; only the address moved.
  await page.getByRole("tab", { name: "Historik" }).click();
  await expect(page).toHaveURL(/\/boder\/historik$/);
  await expect(shown).toHaveAttribute("data-motion", "none");

  await page.goBack();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).toHaveAttribute("data-motion", "none");

  // And the next tap is a new page again.
  await page.getByRole("navigation").last().getByRole("link", { name: "Chat" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(shown).toHaveAttribute("data-motion", "forward");
});

test("the page on screen dims while a tapped tab's page is on its way, and the new one starts from there", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  const shown = page.getByTestId("page");
  await expect(shown).not.toHaveAttribute("data-leaving");

  // Hold the new page back until the old one has been seen to step aside.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/chat(\?|$)/, async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole("navigation").last().getByRole("link", { name: "Chat" }).click();
  await expect(shown).toHaveAttribute("data-leaving", "forward");
  await expect(page).toHaveURL(/\/boder$/);
  // It dims where it stands; it does not move.
  await expect.poll(() => shown.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.45");
  expect(await shown.evaluate((el) => getComputedStyle(el).translate)).toBe("none");

  release();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(shown).not.toHaveAttribute("data-leaving");
  await expect(shown).toHaveAttribute("data-motion", "forward");
  // The new page starts as dimmed as the old one was: the screen is never empty in between.
  expect(await shown.evaluate((el) => el.style.getPropertyValue("--page-from"))).toBe("0.45");
});

test("with reduced motion a page neither comes in nor steps aside", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/boder");
  const shown = page.getByTestId("page");
  await page.getByRole("navigation").last().getByRole("link", { name: "Chat" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(shown).toHaveAttribute("data-motion", "forward");
  expect(await shown.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
