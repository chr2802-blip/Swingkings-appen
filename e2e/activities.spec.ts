import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
/** A datetime-local value on the team's clock. */
const localInput = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" }).format(date).replace(" ", "T");

test("a player adds an activity with a standard job ticked, and it opens with the job handed out", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.taskTemplate.createMany({ data: [{ teamId: team.id, title: "Grill", people: 1 }, { teamId: team.id, title: "Frugt", people: 1 }] });
  await loginAs(anna);
  await page.goto("/aktiviteter");
  await page.getByRole("button", { name: "Ny aktivitet" }).click();
  const dialog = page.getByRole("dialog");
  // Matches and trainings come from KampKlar: the form has no type to pick.
  await expect(dialog.getByLabel("Type")).toHaveCount(0);
  await dialog.getByLabel("Navn").fill("Afslutningsfest");
  await dialog.getByLabel("Starter").fill(localInput(inDays(10)));
  await dialog.getByRole("checkbox", { name: /Grill/ }).check();
  await dialog.getByRole("button", { name: "Gem aktivitet" }).click();

  await expect(page).toHaveURL(/\/aktiviteter\/\w+$/);
  await expect(page.getByRole("heading", { name: "Afslutningsfest", level: 1 })).toBeVisible();
  await expect(page.getByText("Grill")).toBeVisible();
  await expect(page.getByText("Frugt")).toHaveCount(0);
  expect(await db.taskAssignee.count()).toBe(1);
  expect(await db.match.findFirst({ where: { teamId: team.id } })).toMatchObject({ kind: "OTHER" });
});

test("players sign up for a hand-made activity and see who comes", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const party = await db.match.create({ data: { teamId: team.id, kind: "OTHER", title: "Afslutningsfest", startsAt: inDays(10) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${party.id}`);
  await expect(page.getByText("Kommer du?")).toBeVisible();
  await page.getByRole("button", { name: "Jeg kommer", exact: true }).click();
  await expect(page.getByText("Du kommer ✅")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kommer (1)" })).toBeVisible();

  await loginAs(bo);
  await page.goto(`/aktiviteter/${party.id}`);
  await page.getByRole("button", { name: "Jeg kommer ikke" }).click();
  await expect(page.getByText("Du kommer ikke", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kommer ikke (1)" })).toBeVisible();
  expect(await db.activitySignup.findMany({ where: { matchId: party.id }, orderBy: { going: "desc" }, select: { userId: true, going: true } })).toEqual([
    { userId: anna.id, going: true },
    { userId: bo.id, going: false },
  ]);

  await page.goto("/aktiviteter");
  await expect(page.getByText("1 kommer")).toBeVisible();
});

test("an activity from KampKlar takes no sign-ups", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({
    data: { teamId: team.id, title: "Swingkings - AB", opponent: "AB", startsAt: inDays(3), source: "KAMPKLAR", externalUid: "x" },
  });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("heading", { name: "Mod AB", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jeg kommer", exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog", { name: "Handlinger" }).getByRole("button", { name: "Ny opgave" }).click();
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
  await page.getByRole("button", { name: "Handlinger" }).click();
  const menu = page.getByRole("dialog", { name: "Handlinger" });
  await menu.getByRole("button", { name: "Jeg tager den" }).click();
  // The drawer closes once it has worked, and offers the way back next time.
  await expect(menu).toBeHidden();
  await page.getByRole("button", { name: "Handlinger" }).click();
  await expect(menu.getByRole("button", { name: "Tag mig af opgaven" })).toBeVisible();
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

test("an activity shows one action button, and its drawer hands over to the dialog it opens", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: inDays(3) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  for (const name of ["Ny opgave", "Giv bøde", "Ret aktivitet", "Slet aktivitet"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Handlinger" }).click();
  const menu = page.getByRole("dialog", { name: "Handlinger" });
  for (const name of ["Ny opgave", "Giv bøde", "Ret aktivitet", "Slet aktivitet"]) {
    await expect(menu.getByRole("button", { name })).toBeVisible();
  }
  await menu.getByRole("button", { name: "Giv bøde" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await expect(dialog).toBeVisible();
  await expect(menu).toBeHidden();
  await dialog.getByRole("button", { name: "Annuller" }).click();
  await expect(dialog).toBeHidden();
  // Two sheets overlapped on the way; the page must scroll again once both are gone.
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
});
