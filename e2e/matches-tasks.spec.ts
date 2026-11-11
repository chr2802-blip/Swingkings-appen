import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const localInput = (date: Date) => {
  // A datetime-local value on the team's clock.
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" }).format(date);
  return parts.replace(" ", "T");
};

test("a coach adds a match by hand, its standard jobs are handed out, and it opens", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  await db.taskTemplate.createMany({ data: [{ teamId: team.id, title: "Tøjvask", people: 1 }, { teamId: team.id, title: "Frugt", people: 1 }] });
  await loginAs(admin);
  await page.goto("/kampe");
  await page.getByRole("button", { name: "Ny kamp" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Modstander").fill("B.93");
  await dialog.getByLabel("Kampstart").fill(localInput(inDays(5)));
  await dialog.getByLabel("Hjemme eller ude").selectOption("away");
  await dialog.getByRole("button", { name: "Gem kamp" }).click();

  await expect(page).toHaveURL(/\/kampe\/\w+$/);
  await expect(page.getByRole("heading", { name: "Mod B.93", level: 1 })).toBeVisible();
  await expect(page.getByText("Tøjvask")).toBeVisible();
  await expect(page.getByText("Frugt")).toBeVisible();
  expect(await db.taskAssignee.count()).toBe(2);
});

test("a player cannot add matches", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/kampe");
  await expect(page.getByRole("heading", { name: "Kampe", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ny kamp" })).toHaveCount(0);
});

test("a player makes a job for a teammate, who marks it done", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/opgaver");
  await page.getByRole("button", { name: "Ny opgave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Opgave").fill("Købe nye bolde");
  await dialog.getByLabel("Frist").fill(new Date(inDays(3)).toISOString().slice(0, 10));
  await dialog.getByLabel("Hvem skal gøre det?").selectOption("pick");
  await dialog.getByRole("checkbox", { name: "Bo" }).check();
  await dialog.getByRole("button", { name: "Opret opgave" }).click();
  await expect(dialog).toBeHidden();

  await loginAs(bo);
  await page.goto("/opgaver");
  await page.getByRole("link", { name: /Købe nye bolde/ }).click();
  await page.getByRole("button", { name: "Markér som udført ✓" }).click();
  await expect(page.getByRole("button", { name: "Markér som ikke udført" })).toBeVisible();
  expect(await db.task.findFirst({ where: { title: "Købe nye bolde" } })).toMatchObject({ doneById: bo.id });
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

test("a coach keeps the team's standard jobs", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  await loginAs(admin);
  await page.goto("/opgaver/standard");
  await page.getByRole("button", { name: "Ny standardopgave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Opgave").fill("Kørsel");
  await dialog.getByLabel("Antal personer").fill("3");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Kørsel")).toBeVisible();
  expect(await db.taskTemplate.findFirst({ where: { teamId: team.id } })).toMatchObject({ title: "Kørsel", people: 3 });
});
