import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("the front door sends the signed-in to the overview and everyone else to login", async ({ page, loginAs }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/");
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("an old feed link lands on the feed on the front page", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/oversigt#feed$/);
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
});

test("somebody on no team is told to ask for an invitation", async ({ page, loginAs }) => {
  const loner = await db.user.create({ data: { email: "alene@e2e.dk", name: "Alene", passwordHash: "x" } });
  await loginAs(loner);
  await page.goto("/hold/vaelg");
  await expect(page.getByText(/Du er ikke på et hold endnu/)).toBeVisible();
});

test("a player's page lists their fines with what each cost", async ({ page, loginAs }) => {
  const { team, treasurer, anna } = await squad();
  await db.fine.create({ data: { teamId: team.id, playerId: anna.id, reason: "Glemt benskinner", units: 3, unitPriceKr: 10, issuedById: treasurer.id } });
  await loginAs(anna);
  await page.goto(`/boder/spiller/${anna.id}`);
  await expect(page.getByText("Glemt benskinner")).toBeVisible();
  await expect(page.getByText("30 kr").first()).toBeVisible();
});

test("a player's page from another team is not found", async ({ page, loginAs }) => {
  const { anna } = await squad();
  const other = await squad("Naboerne");
  await loginAs(anna);
  const response = await page.goto(`/boder/spiller/${other.bo.id}`);
  expect(response?.status()).toBe(404);
});

test("a super admin creates a team and becomes its coach; nobody else reaches the admin page", async ({ page, loginAs }) => {
  const root = await db.user.create({ data: { email: "root@e2e.dk", name: "Root", passwordHash: "x", role: "SUPER_ADMIN" } });
  await loginAs(root);
  await page.goto("/admin");
  await page.getByLabel("Holdets navn").fill("Nyt hold");
  await page.getByRole("button", { name: "Opret hold" }).click();
  await expect(page.getByText("Nyt hold er oprettet.")).toBeVisible();
  expect(await db.teamMember.findFirst({ where: { userId: root.id, team: { name: "Nyt hold" } } })).toMatchObject({ role: "ADMIN" });

  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/oversigt$/);
});
