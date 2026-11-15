import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("a coach ticks roles as a stack: Bøder, then Admin, and back down", async ({ page, loginAs }) => {
  const { team, admin, anna } = await squad();
  const role = async () => (await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } })).role;
  await loginAs(admin);
  await page.goto("/hold/rettigheder");
  const fines = page.getByRole("checkbox", { name: "Bøder for Anna" });
  const adminTick = page.getByRole("checkbox", { name: "Admin for Anna" });
  await expect(fines).toHaveAttribute("aria-checked", "false");

  await fines.click();
  await expect.poll(role).toBe("TREASURER");

  await adminTick.click();
  await expect.poll(role).toBe("ADMIN");
  // An admin always has the fine rights; that tick cannot be taken off on its own.
  await expect(fines).toHaveAttribute("aria-checked", "true");
  await expect(fines).toBeDisabled();

  // Unticking Admin steps one down and keeps Bøder.
  await adminTick.click();
  await expect.poll(role).toBe("TREASURER");
  await expect(fines).toHaveAttribute("aria-checked", "true");
  await fines.click();
  await expect.poll(role).toBe("PLAYER");
});

test("the last admin cannot untick themselves, and is told why", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold/rettigheder");
  const own = page.getByRole("checkbox", { name: `Admin for ${admin.name}` });
  await own.click();
  await expect(page.getByRole("alert").filter({ hasText: "Holdet skal have mindst én admin." })).toBeVisible();
  await expect(own).toHaveAttribute("aria-checked", "true");
  expect((await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: admin.id } })).role).toBe("ADMIN");
});

test("everybody but an admin is kept out of the rights tab, and has no Spillere in the menu", async ({ page, loginAs }) => {
  const { team, treasurer, anna } = await squad();
  for (const who of [treasurer, anna]) {
    await loginAs(who);
    await page.goto("/hold/rettigheder");
    await expect(page).toHaveURL(/\/oversigt$/);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.goto("/hold/spillere");
    await expect(page).toHaveURL(/\/oversigt$/);
    await page.getByRole("button", { name: team.name }).click();
    await expect(page.getByRole("link", { name: "Min profil" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Spillere" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Holdindstillinger" })).toHaveCount(0);
  }
});

test("the table is a tab of the team settings, beside Holdet", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  await expect(page.getByRole("heading", { name: "Holdindstillinger" })).toBeVisible();
  await page.getByRole("tab", { name: "Rettigheder" }).click();
  await expect(page).toHaveURL(/\/hold\/rettigheder$/);
  await expect(page.getByRole("tabpanel", { name: "Rettigheder" }).getByRole("checkbox", { name: "Admin for Anna" })).toBeVisible();
});
