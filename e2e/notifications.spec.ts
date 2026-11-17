import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

/** A notification as `notify` would leave it, made straight in the database. */
function notification(teamId: string, userId: string, title: string, url: string, category: "FINES" | "TEAM" = "FINES") {
  return db.notification.create({ data: { teamId, userId, category, title, body: `${title} – mere`, url } });
}

test("the bell counts what is new, opens the center, and what is opened is read", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await notification(team.id, anna.id, "Husk kontingent", "/oversigt", "TEAM");
  await notification(team.id, anna.id, "Du har fået en bøde 💸", "/boder");
  // Somebody else's is not Anna's.
  await notification(team.id, bo.id, "Til Bo", "/boder");

  await loginAs(anna);
  await page.goto("/oversigt");
  const header = page.getByRole("banner");
  const bell = header.getByRole("button", { name: "Notifikationer, 2 nye" });
  await expect(bell).toHaveAttribute("data-hydrated", "true");
  await bell.click();

  const center = page.getByRole("dialog", { name: "Notifikationer" });
  await expect(center.getByRole("tab", { name: "Notifikationer" })).toHaveAttribute("aria-selected", "true");
  await expect(center.getByRole("button", { name: /^Ny: / })).toHaveText([/Du har fået en bøde/, /Husk kontingent/]);
  await expect(center.getByText("Til Bo")).toHaveCount(0);
  // Opening the center starts the count again; each stays new until it is opened.
  await expect(header.getByRole("button", { name: "Notifikationer", exact: true })).toBeVisible();

  await center.getByRole("button", { name: "Ny: Du har fået en bøde 💸" }).click();
  await expect(page).toHaveURL(/\/boder$/);
  await expect(center).toBeHidden();
  await expect.poll(async () => (await db.notification.findFirstOrThrow({ where: { title: "Du har fået en bøde 💸" } })).readAt).not.toBeNull();

  await header.getByRole("button", { name: "Notifikationer", exact: true }).click();
  await expect(center.getByRole("button", { name: "Du har fået en bøde 💸" })).toBeVisible();
  await center.getByRole("button", { name: "Marker alle som læst" }).click();
  await expect(center.getByRole("button", { name: /^Ny: / })).toHaveCount(0);
  await expect.poll(() => db.notification.count({ where: { userId: anna.id, readAt: null } })).toBe(0);
});

test("the settings tab turns a category's push off, and says what always comes", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  const bell = page.getByRole("banner").getByRole("button", { name: "Notifikationer" });
  await expect(bell).toHaveAttribute("data-hydrated", "true");
  await bell.click();
  const center = page.getByRole("dialog", { name: "Notifikationer" });
  await expect(center.getByText("Du har ingen notifikationer endnu.")).toBeVisible();

  await center.getByRole("tab", { name: "Indstillinger" }).click();
  await expect(center.getByText(/Beskeder fra en admin.* får du altid/)).toBeVisible();
  const feed = center.getByRole("switch", { name: /^Feed/ });
  await expect(feed).toBeChecked();
  await feed.uncheck();
  await center.getByRole("button", { name: "Gem" }).click();
  await expect(center.getByText("Gemt.")).toBeVisible();
  await expect
    .poll(async () => (await db.teamMember.findUniqueOrThrow({ where: { userId_teamId: { userId: anna.id, teamId: team.id } } })).mutedPush)
    .toEqual(["FEED"]);

  await page.keyboard.press("Escape");
  await expect(center).toBeHidden();
  await bell.click();
  await center.getByRole("tab", { name: "Indstillinger" }).click();
  await expect(center.getByRole("switch", { name: /^Feed/ })).not.toBeChecked();
  await expect(center.getByRole("switch", { name: /^Chat/ })).toBeChecked();
});
