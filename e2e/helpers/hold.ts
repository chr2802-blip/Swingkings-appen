import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Presses and holds a reaction button until the row of reactions comes up, then lets go —
 * as a thumb would. Waits on the row, not on a clock.
 */
export async function hold(page: Page, button: Locator) {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error("The button to hold is not on the screen.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("group", { name: "Vælg en reaktion" })).toBeVisible();
  await page.mouse.up();
}
