import { test, expect } from "./helpers/fixtures";
import { db, member, squad } from "./helpers/database";
import { choose } from "./helpers/select";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
/** A datetime-local value on the team's clock. */
const localInput = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" }).format(date).replace(" ", "T");

/** A club with three teams; Anna of the first is its club admin. */
async function club() {
  const row = await db.club.create({ data: { name: "Swingkings FC" } });
  const first = await squad("Herrer 1");
  const second = await squad("Damer 1");
  const third = await squad("Oldboys");
  await db.team.updateMany({ where: { id: { in: [first.team.id, second.team.id, third.team.id] } }, data: { clubId: row.id } });
  await db.clubAdmin.create({ data: { clubId: row.id, userId: first.anna.id } });
  return { club: row, first, second, third };
}

test("the super admin makes a club, puts a team in it and names a club admin", async ({ page, loginAs }) => {
  const { team, anna } = await squad("Herrer 1");
  const root = await db.user.create({ data: { email: "root@e2e.dk", name: "Root", passwordHash: "x", role: "SUPER_ADMIN", activeTeamId: team.id } });
  await loginAs(root);
  await page.goto("/admin");
  const clubs = page.getByRole("region", { name: "Klubber" });
  await clubs.getByLabel("Klubbens navn").fill("Swingkings FC");
  await clubs.getByRole("button", { name: "Opret klub" }).click();
  await expect(clubs.getByRole("heading", { name: "Swingkings FC" })).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: "Herrer 1" });
  await choose(row.getByLabel("Klub for Herrer 1"), "Swingkings FC");
  await row.getByRole("button", { name: "Gem klub" }).click();
  await expect(clubs.getByText("Hold: Herrer 1")).toBeVisible();

  await choose(clubs.getByLabel("Ny klubadmin"), "Anna");
  await clubs.getByRole("button", { name: "Gør til klubadmin" }).click();
  await expect(clubs.getByText(/Anna\s*· Klubadmin/)).toBeVisible();
  await expect.poll(() => db.clubAdmin.count({ where: { userId: anna.id } })).toBe(1);
});

test("a club admin shares a post with the teams ticked, where players of every one of them comment on it", async ({ page, loginAs }) => {
  const { first, second, third } = await club();
  await loginAs(first.anna);
  await page.goto("/oversigt");
  // The club's page is in the team menu, for its club admins.
  await page.getByRole("button", { name: "Herrer 1" }).click();
  await page.getByRole("link", { name: "Klub", exact: true }).click();
  await expect(page).toHaveURL(/\/klub$/);
  await expect(page.getByRole("heading", { name: "Swingkings FC", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Opret" }).click();
  await page.getByRole("dialog", { name: "Opret" }).getByRole("button", { name: "Nyt klubopslag" }).click();
  const dialog = page.getByRole("dialog", { name: "Del fra Swingkings FC" });
  await dialog.getByRole("checkbox", { name: "Oldboys" }).uncheck();
  await dialog.getByLabel("Tekst").fill("Klubdag på lørdag – alle hold mødes kl. 10!");
  await dialog.getByRole("button", { name: "Del" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Klubopslag" }).getByText(/Klubdag på lørdag/)).toBeVisible();

  // A player on the second team sees it in the team's feed, marked as the club's, and comments.
  await loginAs(second.bo);
  await page.goto("/oversigt");
  await expect(page.getByText("Klubopslag · Swingkings FC")).toBeVisible();
  await expect(page.getByText(/Klubdag på lørdag/)).toBeVisible();
  await page.getByRole("button", { name: "0 kommentarer" }).click();
  const comments = page.getByRole("dialog", { name: "Kommentarer" });
  await comments.getByPlaceholder(/kommentar/i).fill("Damerne kommer!");
  await comments.getByRole("button", { name: "Send" }).click();
  await expect(comments.getByText("Damerne kommer!")).toBeVisible();

  // On the first team the comment from the second is on the same post.
  await loginAs(first.bo);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "1 kommentar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kommentarer" }).getByText("Damerne kommer!")).toBeVisible();

  // The team that was not ticked never sees it; a player who is no club admin has no club page.
  await loginAs(third.bo);
  await page.goto("/oversigt");
  await expect(page.getByText(/Klubdag på lørdag/)).toHaveCount(0);
  await page.goto("/klub");
  await expect(page.getByRole("heading", { name: "Forbi målet" })).toBeVisible();
});

test("a club activity is signed up for by players of every team it is shared with", async ({ page, loginAs }) => {
  const { first, second } = await club();
  const extra = await member(second.team.id, "Dorte");
  await loginAs(first.anna);
  await page.goto("/klub");
  await page.getByRole("button", { name: "Opret" }).click();
  await page.getByRole("dialog", { name: "Opret" }).getByRole("button", { name: "Ny klubaktivitet" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny klubaktivitet" });
  await dialog.getByLabel("Navn").fill("Klubdag");
  await dialog.getByLabel("Starter").fill(localInput(inDays(10)));
  await dialog.getByRole("checkbox", { name: "Oldboys" }).uncheck();
  await dialog.getByRole("button", { name: "Gem aktivitet" }).click();
  await expect(page).toHaveURL(/\/aktiviteter\/\w+$/);
  await expect(page.getByText("Klubaktivitet · Swingkings FC")).toBeVisible();
  await page.getByRole("button", { name: "Jeg kommer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Jeg kommer", exact: true })).toHaveAttribute("aria-pressed", "true");

  // A player on the second team finds it among the team's activities and signs up beside Anna.
  await loginAs(extra);
  await page.goto("/aktiviteter");
  await page.getByRole("link", { name: /Klubdag/ }).click();
  await expect(page.getByText("Tilmeldte (1)")).toBeVisible();
  await page.getByRole("button", { name: "Jeg kommer", exact: true }).click();
  await expect(page.getByText("Tilmeldte (2)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Anna" })).toBeVisible();
  // Changed and deleted only by the club's admins.
  await expect(page.getByRole("button", { name: "Ret klubaktivitet" })).toHaveCount(0);
  await expect.poll(() => db.activitySignup.count({ where: { going: true } })).toBe(2);
});
