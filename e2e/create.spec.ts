import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("each tab's + makes that tab's things: a post at home, a choice in the fine box, an activity; chat has none", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);

  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Nyt opslag" }).click();
  await expect(page.getByRole("dialog", { name: "Del med holdet" })).toBeVisible();

  await page.goto("/boder");
  await page.getByRole("button", { name: "Opret" }).click();
  const menu = page.getByRole("dialog", { name: "Opret" });
  await expect(menu.getByRole("button", { name: "Giv bøde" })).toBeVisible();
  // The catalogue is the treasurer's.
  await expect(menu.getByRole("button", { name: "Ny bøde i kataloget" })).toHaveCount(0);
  await menu.getByRole("button", { name: "Meld udfordring" }).click();
  await expect(page.getByRole("dialog", { name: "Meld en udfordring" })).toBeVisible();

  await page.goto("/aktiviteter");
  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  await expect(page.getByRole("dialog", { name: "Ny aktivitet" })).toBeVisible();

  // The message box is chat's way to make something; a + would sit on top of it.
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(page.locator(".app-create")).toHaveCount(0);
});

test("the + sits in the middle of the tab bar, and slides to the right corner when the bar goes", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  // Enough activities that the list scrolls well past the top.
  await db.match.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      teamId: team.id,
      kind: "OTHER" as const,
      title: `Aktivitet ${i + 1}`,
      startsAt: new Date(Date.now() + (i + 1) * 86_400_000),
    })),
  });
  await loginAs(anna);
  await page.goto("/aktiviteter");

  const plus = page.getByRole("button", { name: "Ny aktivitet" });
  const { width, height } = page.viewportSize()!;
  const box = async () => (await plus.boundingBox())!;
  const centre = async () => Math.round((await box()).x + (await box()).width / 2);
  const rightEdge = async () => Math.round((await box()).x + (await box()).width);
  const bottomEdge = async () => Math.round((await box()).y + (await box()).height);
  await expect.poll(centre).toBe(Math.round(width / 2));
  // On the screen, at its foot, not at the foot of the page.
  await expect(plus).toBeInViewport({ ratio: 1 });
  await expect.poll(bottomEdge).toBeGreaterThan(height - 100);

  await page.evaluate(() => window.scrollBy(0, 800));
  await expect(page.locator("html")).toHaveAttribute("data-bars", "hidden");
  // Its right edge 16px from the screen's, still on screen and still pressable.
  await expect.poll(rightEdge).toBe(width - 16);
  await expect(plus).toBeInViewport({ ratio: 1 });
  await expect.poll(bottomEdge).toBeGreaterThan(height - 100);
  await plus.click();
  await expect(page.getByRole("dialog", { name: "Ny aktivitet" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Annuller" }).click();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("html")).not.toHaveAttribute("data-bars", "hidden");
  await expect.poll(centre).toBe(Math.round(width / 2));
});

test("the bars follow the scroll and settle whichever way is nearer", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.match.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      teamId: team.id,
      kind: "OTHER" as const,
      title: `Aktivitet ${i + 1}`,
      startsAt: new Date(Date.now() + (i + 1) * 86_400_000),
    })),
  });
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const html = page.locator("html");
  // The + is drawn once the page has hydrated, after the scroll listener is in place.
  await expect(page.getByRole("button", { name: "Ny aktivitet" })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(html).toHaveAttribute("data-bars", "hidden");
  // A third of the way back: they settle out again rather than popping up.
  await page.evaluate(() => window.scrollBy(0, -30));
  await expect(html).toHaveAttribute("data-bars", "hidden");
  // Two thirds of the way back: they settle in.
  await page.evaluate(() => window.scrollBy(0, -60));
  await expect(html).not.toHaveAttribute("data-bars");
  await expect(page.getByRole("link", { name: "Chat" })).toBeInViewport({ ratio: 1 });
});

test("a tapped tab lights up, and the highlight moves under it", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  const pill = page.getByTestId("tab-pill");
  const centreOf = async (locator: typeof pill) => {
    const box = (await locator.boundingBox())!;
    return Math.round(box.x + box.width / 2);
  };
  const tab = (name: string) => page.getByRole("navigation").last().getByRole("link", { name });
  // Within a pixel: the two are rounded separately.
  const under = async (name: string) => Math.abs((await centreOf(pill)) - (await centreOf(tab(name))));
  await expect.poll(() => under("Bøder")).toBeLessThanOrEqual(1);

  await tab("Aktiviteter").click();
  await expect(tab("Aktiviteter")).toHaveAttribute("aria-current", "page");
  await expect.poll(() => under("Aktiviteter")).toBeLessThanOrEqual(1);
  await expect(page).toHaveURL(/\/aktiviteter$/);
});

test("the fine box's + becomes the drawer's ×, and closes it again", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  const plus = page.getByRole("button", { name: "Opret" });
  await expect(plus).toHaveAttribute("aria-expanded", "false");
  await plus.click();
  const menu = page.getByRole("dialog", { name: "Opret" });
  await expect(menu.getByRole("button", { name: "Giv bøde" })).toBeVisible();
  await expect(plus).toHaveAttribute("aria-expanded", "true");
  // Above the drawer, not under its backdrop: a real click lands on it.
  await plus.click();
  await expect(menu).toBeHidden();
  await expect(plus).toHaveAttribute("aria-expanded", "false");
});

test("at the end of a page the bars come back, and a window changing height moves nothing", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.match.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      teamId: team.id,
      kind: "OTHER" as const,
      title: `Aktivitet ${i + 1}`,
      startsAt: new Date(Date.now() + (i + 1) * 86_400_000),
    })),
  });
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const html = page.locator("html");
  await expect(page.getByRole("button", { name: "Ny aktivitet" })).toBeVisible();
  const end = () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

  // Well down the page, short of the end: gone.
  await page.evaluate((y) => window.scrollTo(0, y), (await end()) - 300);
  await expect(html).toHaveAttribute("data-bars", "hidden");

  // The browser's own toolbar going away makes the window taller, and the end nearer —
  // the page is pulled back, though nobody scrolled. The bars stay where they are.
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width, height: height + 400 });
  await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(height + 400);
  await expect(html).toHaveAttribute("data-bars", "hidden");

  // Scrolled down to the end: nothing left to read, so the menu is there. (The taller
  // window already stands at the end, so go up a little first, as a finger would.)
  await page.evaluate(() => window.scrollBy(0, -150));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(html).not.toHaveAttribute("data-bars");
  await expect(page.getByRole("link", { name: "Chat" })).toBeInViewport({ ratio: 1 });
});
