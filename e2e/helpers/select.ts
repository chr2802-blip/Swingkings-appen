import { expect, type Locator } from "@playwright/test";

/**
 * Picks a choice in the app's own drop-down (`Select`), as a person would: opens it,
 * optionally searches, and presses the choice. `field` is the drop-down found by its
 * label (`getByLabel("Hvem vandt?")`).
 */
export async function choose(field: Locator, option: string | RegExp, { search }: { search?: string } = {}) {
  const list = await openChoices(field);
  const page = field.page();
  if (search !== undefined) await page.getByRole("searchbox", { name: "Søg" }).fill(search);
  await list.getByRole("option", { name: option, exact: typeof option === "string" }).click();
  // Gone, not just closing: the page has one dialog again, and the drawer — named after
  // the field's label — no longer answers `getByLabel` alongside the field.
  await expect(list).toHaveCount(0);
  await expect(field).toHaveAttribute("aria-expanded", "false");
}

/** Opens the drop-down and returns its list of choices, to look into before choosing. */
export async function openChoices(field: Locator): Promise<Locator> {
  const id = await field.getAttribute("aria-controls");
  await field.click();
  const list = field.page().locator(`[id="${id}"]`);
  await expect(list).toBeVisible();
  return list;
}

/** Ticks each of `options` in a multiple-choice drop-down, then closes it with "Færdig". */
export async function chooseMany(field: Locator, options: (string | RegExp)[]) {
  const list = await openChoices(field);
  await expect(list).toHaveAttribute("aria-multiselectable", "true");
  for (const option of options) {
    const row = list.getByRole("option", { name: option, exact: typeof option === "string" });
    await row.click();
    await expect(row).toHaveAttribute("aria-selected", "true");
  }
  await field.page().getByRole("button", { name: /^Færdig/ }).click();
  await expect(list).toHaveCount(0);
  await expect(field).toHaveAttribute("aria-expanded", "false");
}
