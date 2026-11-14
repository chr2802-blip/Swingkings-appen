import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/fixtures";
import { db, picture, squad } from "./helpers/database";
import { demoPicture } from "../src/lib/demo-pictures";

/** Phone pictures as the file picker hands them over. */
const files = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ name: `billede-${i + 1}.png`, mimeType: "image/png", buffer: Buffer.from(demoPicture(i).full) }));

/** The scale a picture is drawn at, read from its transform. */
async function scaleOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
}

/** Two fingers on the glass, spread from `from` px apart to `to` px apart about a point. */
async function pinchAt(page: Page, at: { x: number; y: number }, from: number, to: number, lift = true) {
  const cdp = await page.context().newCDPSession(page);
  const fingers = (gap: number) => [
    { x: at.x - gap / 2, y: at.y, id: 1 },
    { x: at.x + gap / 2, y: at.y, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(from) });
  for (let step = 1; step <= 5; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(from + ((to - from) * step) / 5) });
  }
  if (lift) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return cdp;
}

async function centreOf(page: Page, name: string) {
  const box = await page.getByRole("img", { name }).boundingBox();
  if (!box) throw new Error(`${name} is not on screen`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("the chat sends several pictures in one message, and pressing one opens them full screen", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/chat");
  await page.getByLabel("Vælg billeder").setInputFiles(files(3));
  const chosen = page.getByRole("list", { name: "Valgte billeder" });
  await expect(chosen.getByRole("img")).toHaveCount(3);
  // One can be taken off again before sending.
  await chosen.getByRole("button", { name: "Fjern billede 3" }).click();
  await expect(chosen.getByRole("img")).toHaveCount(2);
  await page.getByLabel("Vælg billeder").setInputFiles(files(1));
  await expect(chosen.getByRole("img")).toHaveCount(3);
  await page.getByRole("textbox", { name: "Besked" }).fill("Fra opvarmningen");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(chosen).toBeHidden();
  await expect(page.getByText("Fra opvarmningen")).toBeVisible();
  expect(await db.chatMessage.count()).toBe(1);
  expect(await db.chatPhoto.count()).toBe(3);

  await loginAs(bo);
  await page.goto("/chat");
  await page.getByRole("img", { name: "Billede i chatten (2 af 3)" }).click();
  const viewer = page.getByRole("dialog", { name: "Billede i chatten" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("3 / 3")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("1 / 3")).toBeVisible();
  // The browser's back button closes it and stays in the chat, as on a phone.
  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(page).toHaveURL(/\/chat$/);
  await page.getByRole("img", { name: "Billede i chatten (1 af 3)" }).click();
  await viewer.getByRole("button", { name: "Luk billede" }).click();
  await expect(viewer).toBeHidden();
});

test("the chat refuses an eleventh picture in one message", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/chat");
  await page.getByLabel("Vælg billeder").setInputFiles(files(11));
  await expect(page.getByText("Højst 10 billeder pr. besked.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Valgte billeder" }).getByRole("img")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Vedhæft billeder" })).toBeDisabled();
});

test("a post's pictures open in the viewer, where they swipe, double-tap to zoom and pull down to close", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const photos = [await picture(team.id, 0), await picture(team.id, 1)];
  await db.post.create({
    data: { teamId: team.id, authorId: bo.id, body: "Kampbilleder", photos: { create: photos.map((p, position) => ({ photoId: p.id, position })) } },
  });
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("img", { name: "Kampbilleder (1 af 2)" }).click();
  const viewer = page.getByRole("dialog", { name: "Kampbilleder" });
  await expect(viewer.getByText("1 / 2")).toBeVisible();
  const shown = "[role=dialog] img[data-current]";

  // Swipe left to the next picture.
  const frame = viewer.getByTestId("photo-viewer-frame");
  const box = (await frame.boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await swipe(page, mid, { x: mid.x - box.width * 0.4, y: mid.y });
  await expect(viewer.getByText("2 / 2")).toBeVisible();
  await swipe(page, mid, { x: mid.x + box.width * 0.4, y: mid.y });
  await expect(viewer.getByText("1 / 2")).toBeVisible();

  // Double tap zooms in on the spot, and again zooms out.
  await page.touchscreen.tap(mid.x, mid.y);
  await page.touchscreen.tap(mid.x, mid.y);
  await expect.poll(() => scaleOf(page, shown)).toBe(2.5);
  await page.touchscreen.tap(mid.x, mid.y);
  await page.touchscreen.tap(mid.x, mid.y);
  await expect.poll(() => scaleOf(page, shown)).toBe(1);

  // Two fingers spread zoom in, too.
  await pinchAt(page, mid, 100, 250);
  await expect.poll(() => scaleOf(page, shown)).toBeCloseTo(2.5, 1);
  await page.touchscreen.tap(mid.x, mid.y);
  await page.touchscreen.tap(mid.x, mid.y);
  await expect.poll(() => scaleOf(page, shown)).toBe(1);

  // Pulled down, it closes.
  await swipe(page, mid, { x: mid.x, y: mid.y + 250 });
  await expect(viewer).toBeHidden();
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("pinching a picture in the feed zooms it where it is and lets go again", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const photo = await picture(team.id);
  await db.post.create({ data: { teamId: team.id, authorId: bo.id, body: "Holdbillede", photos: { create: { photoId: photo.id, position: 0 } } } });
  await loginAs(anna);
  await page.goto("/oversigt");
  const at = await centreOf(page, "Holdbillede");
  const cdp = await pinchAt(page, at, 80, 200, false);
  // The copy over the page follows the fingers; the picture in the card waits underneath.
  const copy = 'body > div[aria-hidden="true"] img';
  await expect.poll(() => scaleOf(page, copy)).toBeCloseTo(2.5, 1);
  await expect(page.locator('img[alt="Holdbillede"]')).toHaveCSS("visibility", "hidden");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(copy)).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Holdbillede" })).toBeVisible();
  // Letting go is not a press: the viewer stays shut.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

/** One finger dragged across the glass. */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
  for (let step = 1; step <= 8; step++) {
    const x = from.x + ((to.x - from.x) * step) / 8;
    const y = from.y + ((to.y - from.y) * step) / 8;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
