import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("a coach ticks roles as a stack: Bøder, then Admin, and back down", async ({ page, loginAs }) => {
  const { team, admin, anna } = await squad();
  const role = async () => (await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } })).role;
  await loginAs(admin);
  await page.goto("/hold");
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
  await page.goto("/hold");
  const own = page.getByRole("checkbox", { name: `Admin for ${admin.name}` });
  await own.click();
  await expect(page.getByRole("alert").filter({ hasText: "Holdet skal have mindst én admin." })).toBeVisible();
  await expect(own).toHaveAttribute("aria-checked", "true");
  expect((await db.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: admin.id } })).role).toBe("ADMIN");
});

test("a player sees no ticks on the members table", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/hold");
  await expect(page.getByRole("checkbox", { name: "Admin for Anna" })).toHaveCount(0);
});
