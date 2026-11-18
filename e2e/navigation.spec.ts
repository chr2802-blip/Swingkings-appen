import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("the front door sends the signed-in to the overview and everyone else to login", async ({
  page,
  loginAs,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/");
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("an old feed link lands on the feed on the front page", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/oversigt#feed$/);
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
});

test("somebody on no team is told to ask for an invitation", async ({
  page,
  loginAs,
}) => {
  const loner = await db.user.create({
    data: { email: "alene@e2e.dk", name: "Alene", passwordHash: "x" },
  });
  await loginAs(loner);
  await page.goto("/hold/vaelg");
  await expect(page.getByText(/Du er ikke på et hold endnu/)).toBeVisible();
});

test("a player's page lists their fines with what each cost", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna } = await squad();
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      reason: "Glemt benskinner",
      units: 3,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    },
  });
  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}/boder`);
  const fines = page.getByRole("tabpanel", { name: "Bøder og udfordringer" });
  await expect(fines.getByText("Glemt benskinner")).toBeVisible();
  await expect(fines.getByText("30 kr")).toBeVisible();
});

test("a player's page from another team is not found", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  const other = await squad("Naboerne");
  await loginAs(anna);
  const response = await page.goto(`/spiller/${other.bo.id}`);
  expect(response?.status()).toBe(404);
});

test("a super admin creates a team without joining it, looks into it, goes home again; nobody else reaches the admin page", async ({
  page,
  loginAs,
}) => {
  const { team: home, admin } = await squad();
  const root = await db.user.create({
    data: {
      email: "root@e2e.dk",
      name: "Root",
      passwordHash: "x",
      role: "SUPER_ADMIN",
      activeTeamId: home.id,
    },
  });
  await db.teamMember.create({ data: { teamId: home.id, userId: root.id, role: "PLAYER" } });
  await loginAs(root);
  await page.goto("/admin");
  await page.getByLabel("Holdets navn").fill("Nyt hold");
  await page.getByRole("button", { name: "Opret hold" }).click();
  await expect(page.getByText(/Når personen har oprettet sig/)).toBeVisible();
  expect(await db.teamMember.count({ where: { userId: root.id } })).toBe(1);

  await page
    .getByRole("listitem")
    .filter({ hasText: "Nyt hold" })
    .getByRole("button", { name: "Åbn" })
    .click();
  await expect(page).toHaveURL(/\/oversigt$/);
  const banner = page.getByRole("status").filter({ hasText: "som super admin" });
  await expect(banner).toContainText("Du kigger på Nyt hold som super admin. Du er ikke på holdet.");
  // Not on the team, so nothing on it is for them: no bell.
  await expect(page.getByRole("banner").getByRole("button", { name: /^Notifikationer/ })).toHaveCount(0);
  await banner.getByRole("button", { name: "Tilbage til Swingkings" }).click();
  await expect(banner).toBeHidden();
  expect((await db.user.findUniqueOrThrow({ where: { id: root.id } })).activeTeamId).toBe(home.id);

  await loginAs(admin);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("a super admin makes the test team, looks into it without joining, and takes it away again", async ({
  page,
  loginAs,
}) => {
  const root = await db.user.create({
    data: {
      email: "root@e2e.dk",
      name: "Root",
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });
  await loginAs(root);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Opret testhold" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Opret testhold" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Swingkings Demo" }),
  ).toBeVisible();
  expect(await db.teamMember.count({ where: { userId: root.id } })).toBe(0);

  await page.goto("/chat");
  await expect(
    page.getByRole("status").filter({ hasText: "Du kigger på Swingkings Demo som super admin." }),
  ).toBeVisible();
  await expect(
    page.getByText("Husk mødetid 13:45 på lørdag! 💪"),
  ).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Slet testhold" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Slet testholdet" })
    .click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Swingkings Demo" }),
  ).toBeHidden();
  expect(await db.team.count({ where: { name: "Swingkings Demo" } })).toBe(0);
  expect(
    await db.user.count({
      where: { email: { endsWith: "@demo.swingkings.dk" } },
    }),
  ).toBe(0);
});

/** Where the tab stands in its history — Chromium's Navigation API, which the suite runs on. */
const historyIndex = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { navigation: { currentEntry: { index: number } } })
        .navigation.currentEntry.index,
  );

test("browser back closes the dialog and stays on the page behind it", async ({
  page,
  loginAs,
}) => {
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

test("a drawer and the dialog it opens share one history step, and a saved form leaves none", async ({
  page,
  loginAs,
}) => {
  const { team, anna } = await squad();
  const match = await db.match.create({
    data: {
      teamId: team.id,
      title: "Afslutningsfest",
      kind: "OTHER",
      startsAt: new Date(Date.now() + 3 * 86_400_000),
    },
  });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  const before = await historyIndex(page);

  await page.getByRole("button", { name: "Opret" }).click();
  const menu = page.getByRole("dialog", { name: "Opret" });
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
  await page.getByRole("button", { name: "Opret" }).click();
  await menu.getByRole("button", { name: "Ny opgave" }).click();
  await dialog.getByLabel("Opgave").fill("Købe nye bolde");
  await dialog.getByRole("button", { name: "Opret opgave" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("tab", { name: "Opgaver (1)" })).toBeVisible();
  await expect.poll(() => historyIndex(page)).toBe(before);
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}$`));
});

test("a form that moves on to a new page leaves the browser's history alone", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const before = await historyIndex(page);
  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny aktivitet" });
  await dialog.getByLabel("Navn").fill("Afslutningsfest");
  await dialog.getByLabel("Starter").fill("2031-06-01T18:00");
  await dialog.getByRole("button", { name: "Gem aktivitet" }).click();
  await expect(
    page.getByRole("heading", { name: "Afslutningsfest", level: 1 }),
  ).toBeVisible();
  // The dialog went with the page it was on; nothing may step back off the new one.
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/aktiviteter\/\w+$/);
  expect(await historyIndex(page)).toBeGreaterThan(before);
  await page.goBack();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(dialog).toBeHidden();
});

test("a tab's page comes in from the side the tab is on, and a page inside a tab opens", async ({
  page,
  loginAs,
}) => {
  const { team, anna } = await squad();
  await db.match.create({
    data: {
      teamId: team.id,
      title: "Afslutningsfest",
      kind: "OTHER",
      startsAt: new Date(Date.now() + 3 * 86_400_000),
    },
  });
  await loginAs(anna);
  await page.goto("/boder");
  const shown = page.getByTestId("page");
  const tabs = page.getByRole("navigation").last();
  await expect(shown).toHaveAttribute("data-motion", "first");

  await tabs.getByRole("link", { name: "Aktiviteter" }).click();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).toHaveAttribute("data-motion", "forward");
  expect(await shown.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "page-forward",
  );

  await page.getByRole("link", { name: /Afslutningsfest/ }).click();
  await expect(
    page.getByRole("heading", { name: "Afslutningsfest", level: 1 }),
  ).toBeVisible();
  await expect(shown).toHaveAttribute("data-motion", "open");

  await tabs.getByRole("link", { name: "Bøder" }).click();
  await expect(page).toHaveURL(/\/boder$/);
  await expect(shown).toHaveAttribute("data-motion", "backward");

  // Once in, the page is itself again: nothing is left on it for a fixed child to hang from.
  await expect
    .poll(() => shown.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  expect(
    await shown.evaluate((el) => [
      getComputedStyle(el).translate,
      getComputedStyle(el).opacity,
    ]),
  ).toEqual(["none", "1"]);
});

test("back, and a swipe between the fine box's pages, bring nothing in", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const shown = page.getByTestId("page");
  await page
    .getByRole("navigation")
    .last()
    .getByRole("link", { name: "Bøder" })
    .click();
  await expect(shown).toHaveAttribute("data-motion", "backward");

  // The page was already there, beside the one shown; only the address moved.
  await page.getByRole("tab", { name: "Historik" }).click();
  await expect(page).toHaveURL(/\/boder\/historik$/);
  await expect(shown).toHaveAttribute("data-motion", "none");

  await page.goBack();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).toHaveAttribute("data-motion", "none");

  // And the next tap is a new page again.
  await page
    .getByRole("navigation")
    .last()
    .getByRole("link", { name: "Hjem" })
    .click();
  await expect(page).toHaveURL(/\/oversigt$/);
  await expect(shown).toHaveAttribute("data-motion", "backward");
});

test("the page on screen dims while a tapped tab's page is on its way, and the new one starts from there", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  const shown = page.getByTestId("page");
  await expect(shown).not.toHaveAttribute("data-leaving");

  // Hold the new page back until the old one has been seen to step aside.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/aktiviteter(\?|$)/, async (route) => {
    await held;
    await route.continue();
  });
  await page
    .getByRole("navigation")
    .last()
    .getByRole("link", { name: "Aktiviteter" })
    .click();
  await expect(shown).toHaveAttribute("data-leaving", "forward");
  await expect(page).toHaveURL(/\/boder$/);
  // It dims where it stands; it does not move.
  await expect
    .poll(() => shown.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("0.45");
  expect(await shown.evaluate((el) => getComputedStyle(el).translate)).toBe(
    "none",
  );

  release();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).not.toHaveAttribute("data-leaving");
  await expect(shown).toHaveAttribute("data-motion", "forward");
  // The new page starts as dimmed as the old one was: the screen is never empty in between.
  expect(
    await shown.evaluate((el) => el.style.getPropertyValue("--page-from")),
  ).toBe("0.45");
});

test("with reduced motion a page neither comes in nor steps aside", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/boder");
  const shown = page.getByTestId("page");
  await page
    .getByRole("navigation")
    .last()
    .getByRole("link", { name: "Aktiviteter" })
    .click();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).toHaveAttribute("data-motion", "forward");
  expect(await shown.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
});

test("a detail page has a back arrow that goes back to where you came from", async ({
  page,
  loginAs,
}) => {
  const { team, anna, bo, treasurer } = await squad();
  const party = await db.match.create({
    data: {
      teamId: team.id,
      kind: "OTHER",
      title: "Afslutningsfest",
      startsAt: new Date(Date.now() + 10 * 86_400_000),
    },
  });
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: bo.id,
      reason: "For sent",
      units: 1,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    },
  });
  await loginAs(anna);

  // The tabs have none.
  await page.goto("/aktiviteter");
  await expect(page.getByRole("link", { name: "Tilbage" })).toHaveCount(0);

  // The detail page comes in from the right, and the arrow brings the list back in from the left.
  const shown = page.getByTestId("page");
  await page.getByRole("link", { name: /Afslutningsfest/ }).click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${party.id}$`));
  await expect(shown).toHaveAttribute("data-motion", "open");
  await page.getByRole("link", { name: "Tilbage" }).click();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).toHaveAttribute("data-motion", "close");
  expect(await shown.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "page-close",
  );

  // Back from a player goes to the fines it was opened from, not to the page above it.
  await page.goto("/boder");
  await page.getByRole("link", { name: /\bBo\b/ }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}$`));
  await page.getByRole("link", { name: "Tilbage" }).click();
  await expect(page).toHaveURL(/\/boder$/);
  await expect(shown).toHaveAttribute("data-motion", "close");

  // The browser's own back is still left to the phone to draw.
  await page.getByRole("link", { name: /\bBo\b/ }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}$`));
  await expect(shown).toHaveAttribute("data-motion", "open");
  await page.goBack();
  await expect(page).toHaveURL(/\/boder$/);
  await expect(shown).toHaveAttribute("data-motion", "none");
});

test("a detail page opened straight from a link goes up to the page above it", async ({
  page,
  loginAs,
}) => {
  const { team, anna } = await squad();
  const party = await db.match.create({
    data: {
      teamId: team.id,
      kind: "OTHER",
      title: "Afslutningsfest",
      startsAt: new Date(Date.now() + 10 * 86_400_000),
    },
  });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${party.id}`);
  await page.getByRole("link", { name: "Tilbage" }).click();
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(page.getByTestId("page")).toHaveAttribute(
    "data-motion",
    "close",
  );
  await expect(page.getByRole("link", { name: "Tilbage" })).toHaveCount(0);
});

test("your own page is the profile tab and has no back arrow; the chat has one", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}`);
  await expect(
    page.getByRole("heading", { name: "Anna", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Tilbage" })).toHaveCount(0);
  // Nor have its tabs.
  await page.getByRole("tab", { name: "Opgaver" }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}/opgaver$`));
  await expect(page.getByRole("link", { name: "Tilbage" })).toHaveCount(0);
  await page.goto("/chat");
  await page.getByRole("link", { name: "Tilbage" }).click();
  await expect(page).toHaveURL(/\/oversigt$/);
});

/** The app as opened from the home screen, where an iPhone has no back swipe of its own. */
async function installed(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { value: true }),
  );
}

/**
 * A finger from (x, y) to (x + dx, y + dy), in steps, as a real swipe sends it. Chromium as
 * an Android phone goes back by itself on a sideways overscroll; that is the browser's, not
 * the app's, so it is switched off here and only the app's own swipe is left.
 */
async function swipe(page: Page, x: number, y: number, dx: number, dy = 0) {
  await page.addStyleTag({
    content: "html, body { overscroll-behavior-x: none; }",
  });
  const cdp = await page.context().newCDPSession(page);
  const at = (i: number, steps: number) => [
    { x: x + (dx * i) / steps, y: y + (dy * i) / steps },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: at(0, 1),
  });
  for (let i = 1; i <= 10; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: at(i, 10),
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

// These run on an old job's own page (one with no activity): an activity's page has tabs
// swiped sideways, and Chromium as an Android phone goes back by itself on a sideways
// overscroll there, whatever the CSS says.
test("in the installed app a swipe in from the left edge goes back, and a short one does not", async ({
  page,
  loginAs,
}) => {
  const { team, anna } = await squad();
  const task = await db.task.create({
    data: {
      teamId: team.id,
      title: "Grill",
      dueAt: new Date(Date.now() + 10 * 86_400_000),
    },
  });
  await installed(page);
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const shown = page.getByTestId("page");
  await page.goto(`/opgaver/${task.id}`);
  await expect(page.getByRole("link", { name: "Tilbage" })).toBeVisible();

  // Too short: the page slides back and lets go of the swipe.
  await swipe(page, 5, 400, 60);
  await expect(shown).not.toHaveAttribute("data-dragging");
  await expect(page).toHaveURL(new RegExp(`/opgaver/${task.id}$`));
  expect(await shown.evaluate((el) => el.style.translate)).toBe("");

  // Started inside the page: not ours.
  await swipe(page, 120, 400, 250);
  await expect(page).toHaveURL(new RegExp(`/opgaver/${task.id}$`));

  // Far enough: back to the list, which closes in, with nothing of the swipe left on it.
  await swipe(page, 5, 400, 250);
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await expect(shown).toHaveAttribute("data-motion", "close");
  await expect(shown).not.toHaveAttribute("data-dragging");
  expect(await shown.evaluate((el) => el.style.translate)).toBe("");

  // A tab has nothing to go back to.
  await swipe(page, 5, 400, 250);
  await expect(page).toHaveURL(/\/aktiviteter$/);
});

test("in a browser the edge is left to the phone's own back swipe", async ({
  page,
  loginAs,
}) => {
  const { team, anna } = await squad();
  const task = await db.task.create({
    data: {
      teamId: team.id,
      title: "Grill",
      dueAt: new Date(Date.now() + 10 * 86_400_000),
    },
  });
  await loginAs(anna);
  await page.goto(`/opgaver/${task.id}`);
  await expect(page.getByRole("link", { name: "Tilbage" })).toBeVisible();
  await swipe(page, 5, 400, 250);
  await expect(page.getByTestId("page")).not.toHaveAttribute("data-dragging");
  await expect(page).toHaveURL(new RegExp(`/opgaver/${task.id}$`));
});

test("a long team name is cut short in the header, clear of the bell and the chat", async ({ page, loginAs }) => {
  const { anna } = await squad("Swingkings Oldboys Søndagsholdet fra Frederiksberg");
  await loginAs(anna);
  await page.goto("/oversigt");
  const name = page.getByRole("banner").getByRole("button", { name: /Swingkings Oldboys/ });
  const bell = page.getByRole("banner").getByLabel(/^Notifikationer/);
  const nameBox = (await name.boundingBox())!;
  const bellBox = (await bell.first().boundingBox())!;
  expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(bellBox.x);
});
