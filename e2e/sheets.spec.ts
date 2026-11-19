import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

/**
 * A finger on the screen: real touch input, so the browser scrolls what it would scroll.
 * `lift: false` leaves the finger down, to look at the sheet mid-pull.
 */
async function pull(page: Page, from: { x: number; y: number }, dy: number, { lift = true } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: from.x, y }] });
  await touch("touchStart", from.y);
  for (let step = 1; step <= 10; step++) await touch("touchMove", from.y + (dy * step) / 10);
  if (lift) await touch("touchEnd");
  return () => touch("touchEnd");
}

/** Once the sheet has finished rising, so where it stands is where it rests. */
async function settled(sheet: Locator) {
  await expect(sheet).toBeVisible();
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  return (await sheet.boundingBox())!;
}

const transform = (sheet: Locator) => sheet.evaluate((el) => (el as HTMLElement).style.transform);

test("a drawer is pulled down by its top to close it; let go early, it slides back up", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/boder");
  const plus = page.getByRole("button", { name: "Opret" });
  await plus.click();
  const menu = page.getByRole("dialog", { name: "Opret" });
  const rest = await settled(menu);
  const grip = { x: rest.x + rest.width / 2, y: rest.y + 12 };

  // A short pull: the drawer follows the finger, then goes back where it was.
  const lift = await pull(page, grip, 30, { lift: false });
  await expect.poll(() => transform(menu)).toBe("translateY(30px)");
  await lift();
  await expect.poll(async () => (await menu.boundingBox())!.y).toBeCloseTo(rest.y, 0);
  await expect(menu.getByRole("button", { name: "Giv bøde" })).toBeVisible();

  // Far enough, and it goes, as the × would have done it.
  await pull(page, grip, 200);
  await expect(menu).toBeHidden();
  await expect(plus).toHaveAttribute("aria-expanded", "false");
});

test("a drawer's body pulls it down only when scrolled to the top", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const post = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr 3-1!" } });
  await db.postComment.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({ postId: post.id, authorId: bo.id, body: `Kommentar nummer ${i + 1}` })),
  });
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "30 kommentarer" }).click();
  const drawer = page.getByRole("dialog", { name: "Kommentarer" });
  await settled(drawer);
  const list = drawer.getByRole("list", { name: "Kommentarer" });
  await expect(list.getByText("Kommentar nummer 1", { exact: true })).toBeVisible();

  // Scrolled down, a finger going down scrolls back up; the drawer stays where it is.
  const scroller = list.locator("xpath=ancestor::*[contains(@class, 'overflow-y-auto')][1]");
  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const middle = (await scroller.boundingBox())!;
  const at = { x: middle.x + middle.width / 2, y: middle.y + middle.height / 3 };
  const lift = await pull(page, at, 150, { lift: false });
  expect(await transform(drawer)).toBe("");
  await lift();
  await expect(drawer).toBeVisible();

  // At the top, the same pull takes the drawer with it.
  await scroller.evaluate((el) => (el.scrollTop = 0));
  await pull(page, at, 200);
  await expect(drawer).toBeHidden();
});

test("a full-screen sheet is pulled down only by its header, so a form is not lost by scrolling", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Nyt opslag" }).click();
  const sheet = page.getByRole("dialog", { name: "Del med holdet" });
  const rest = await settled(sheet);
  await sheet.getByRole("textbox").first().fill("Husk bolde");

  // From the middle of the form: nothing moves.
  const lift = await pull(page, { x: rest.x + rest.width / 2, y: rest.y + rest.height / 2 }, 250, { lift: false });
  expect(await transform(sheet)).toBe("");
  await lift();
  await expect(sheet.getByRole("textbox").first()).toHaveValue("Husk bolde");

  // From the title: it goes.
  const title = (await sheet.getByRole("heading", { name: "Del med holdet" }).boundingBox())!;
  await pull(page, { x: title.x + 10, y: title.y + title.height / 2 }, 250);
  await expect(sheet).toBeHidden();
});

test("on a wide screen the centred panel does not move with a finger", async ({ page, loginAs }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Nyt opslag" }).click();
  const sheet = page.getByRole("dialog", { name: "Del med holdet" });
  await settled(sheet);
  const title = (await sheet.getByRole("heading", { name: "Del med holdet" }).boundingBox())!;
  const lift = await pull(page, { x: title.x + 10, y: title.y + title.height / 2 }, 250, { lift: false });
  expect(await transform(sheet)).toBe("");
  await lift();
  await expect(sheet).toBeVisible();
});
