import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
/** A datetime-local value on the team's clock. */
const localInput = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" }).format(date).replace(" ", "T");

test("a player adds a match with a standard job ticked, and it opens with the job handed out", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.taskTemplate.createMany({ data: [{ teamId: team.id, title: "Trøjevask", people: 1 }, { teamId: team.id, title: "Frugt", people: 1 }] });
  await loginAs(anna);
  await page.goto("/aktiviteter");
  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Modstander").fill("B.93");
  await dialog.getByLabel("Starter").fill(localInput(inDays(5)));
  await dialog.getByLabel("Hjemme eller ude").selectOption("away");
  await dialog.getByRole("checkbox", { name: /Trøjevask/ }).check();
  await dialog.getByRole("button", { name: "Gem aktivitet" }).click();

  await expect(page).toHaveURL(/\/aktiviteter\/\w+$/);
  await expect(page.getByRole("heading", { name: "Mod B.93", level: 1 })).toBeVisible();
  await expect(page.getByText("Trøjevask")).toBeVisible();
  await expect(page.getByText("Frugt")).toHaveCount(0);
  expect(await db.taskAssignee.count()).toBe(1);
});

test("an activity that is not a match is named by its title", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/aktiviteter");
  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type").selectOption("OTHER");
  await dialog.getByLabel("Navn").fill("Afslutningsfest");
  await dialog.getByLabel("Starter").fill(localInput(inDays(10)));
  await dialog.getByRole("button", { name: "Gem aktivitet" }).click();
  await expect(page.getByRole("heading", { name: "Afslutningsfest", level: 1 })).toBeVisible();
});

test("old links to matches and the task list land in their new homes", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Swingkings - AB", opponent: "AB", startsAt: inDays(3) } });
  await loginAs(anna);
  await page.goto("/kampe");
  await expect(page).toHaveURL(/\/aktiviteter$/);
  await page.goto(`/kampe/${match.id}`);
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}$`));
  await page.goto("/opgaver");
  await expect(page).toHaveURL(/\/oversigt$/);
  // The standard jobs moved to the team settings, which a player sees as the roster.
  await page.goto("/aktiviteter/standardopgaver");
  await expect(page).toHaveURL(/\/hold\/spillere#standardopgaver$/);
});

test("a player puts a job on an activity for a teammate, who marks it done", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Swingkings - AB", opponent: "AB", startsAt: inDays(3) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await page.getByRole("button", { name: "Ny opgave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Opgave").fill("Købe nye bolde");
  await dialog.getByLabel("Hvem skal gøre det?").selectOption("pick");
  await dialog.getByRole("checkbox", { name: "Bo" }).check();
  await dialog.getByRole("button", { name: "Opret opgave" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Købe nye bolde")).toBeVisible();

  await loginAs(bo);
  await page.goto(`/aktiviteter/${match.id}`);
  await page.getByRole("button", { name: "Markér som udført" }).click();
  await expect.poll(async () => (await db.task.findFirst({ where: { title: "Købe nye bolde" } }))?.doneById).toBe(bo.id);
});

test("somebody takes an open job", async ({ page, loginAs }) => {
  const { team, bo } = await squad();
  const task = await db.task.create({ data: { teamId: team.id, title: "Kage til kampen", dueAt: inDays(2) } });
  await loginAs(bo);
  await page.goto(`/opgaver/${task.id}`);
  await page.getByRole("button", { name: "Jeg tager den" }).click();
  await expect(page.getByRole("button", { name: "Tag mig af opgaven" })).toBeVisible();
  expect(await db.taskAssignee.count({ where: { taskId: task.id, userId: bo.id } })).toBe(1);
});

test("an admin keeps the team's standard jobs under the team settings; a player cannot", async ({ page, loginAs }) => {
  const { team, admin, anna } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  await page.getByRole("button", { name: "Ny standardopgave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Opgave").fill("Kørsel");
  await dialog.getByLabel("Antal personer").fill("3");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Kørsel/)).toBeVisible();
  expect(await db.taskTemplate.findFirst({ where: { teamId: team.id } })).toMatchObject({ title: "Kørsel", people: 3 });

  await loginAs(anna);
  await page.goto("/hold");
  await expect(page.getByRole("button", { name: "Ny standardopgave" })).toHaveCount(0);
});
