import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

/** The jobs' tab: a job of your own is also named on the details. */
const jobsTab = (page: import("@playwright/test").Page) => page.getByRole("tabpanel", { name: /^Opgaver/ });
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
  await page.getByRole("tab", { name: "Opgaver (1)" }).click();
  await expect(page).toHaveURL(/\/aktiviteter\/\w+\/opgaver$/);
  await expect(jobsTab(page).getByText("Grill")).toBeVisible();
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
  // Under the row: one coming, one not.
  const row = page.getByRole("link", { name: /Afslutningsfest/ });
  await expect(row.getByText("1 kommer", { exact: true })).toBeVisible();
  await expect(row.getByText("1 kommer ikke", { exact: true })).toBeVisible();
});

test("the list shows every kind from today, with the earlier ones folded away under Vis tidligere", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.match.createMany({
    data: [
      { teamId: team.id, kind: "MATCH", title: "Swingkings - B93", opponent: "B93", startsAt: inDays(-20) },
      { teamId: team.id, kind: "TRAINING", title: "Gammel træning", startsAt: inDays(-3) },
      { teamId: team.id, kind: "TRAINING", title: "Tirsdagstræning", startsAt: inDays(2) },
      { teamId: team.id, kind: "MATCH", title: "Swingkings - AB", opponent: "AB", startsAt: inDays(3) },
      { teamId: team.id, kind: "OTHER", title: "Afslutningsfest", startsAt: inDays(10) },
    ],
  });
  await loginAs(anna);
  await page.goto("/aktiviteter");

  // The page opens at its top: the heading, then what is ahead, in the order it is played.
  await expect(page.getByRole("heading", { name: "Aktiviteter", level: 1 })).toBeInViewport();
  await expect(page.getByRole("link", { name: /Tirsdagstræning|AB|Afslutningsfest/ })).toHaveText([/Tirsdagstræning/, /AB/, /Afslutningsfest/]);
  // What has been played is folded away.
  await expect(page.getByRole("link", { name: /Gammel træning/ })).toBeHidden();
  await expect(page.getByRole("link", { name: /B93/ })).toBeHidden();

  await page.getByText("Vis tidligere").click();
  const earlier = page.getByRole("region", { name: "Tidligere aktiviteter" });
  // Newest first, under the ones ahead.
  await expect(earlier.getByRole("link")).toHaveText([/Gammel træning/, /B93/]);
  await expect(page.getByText("Vis tidligere")).toBeHidden();
  await earlier.getByRole("link", { name: /Gammel træning/ }).click();
  await expect(page.getByRole("heading", { name: "Gammel træning", level: 1 })).toBeVisible();
});

test("each row says one thing on its right, and home or away under the name", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const home = await db.match.create({
    data: { teamId: team.id, kind: "MATCH", title: "Swingkings - AB", opponent: "AB", isHome: true, location: "Bane 1", startsAt: inDays(3) },
  });
  await db.task.create({ data: { teamId: team.id, matchId: home.id, title: "Grill" } });
  await db.match.createMany({
    data: [
      { teamId: team.id, kind: "MATCH", title: "B93 - Swingkings", opponent: "B93", isHome: false, startsAt: inDays(4) },
      { teamId: team.id, kind: "TRAINING", title: "Tirsdagstræning", startsAt: inDays(5), cancelledAt: new Date() },
    ],
  });
  await loginAs(anna);
  await page.goto("/aktiviteter");

  const ab = page.getByRole("link", { name: /AB/ });
  await expect(ab).toContainText("Hjemme · Bane 1");
  await expect(ab).toContainText("1 opgave");
  const b93 = page.getByRole("link", { name: /B93/ });
  await expect(b93).toContainText("Ude");
  await expect(b93).not.toContainText("opgave");
  const training = page.getByRole("link", { name: /Tirsdagstræning/ });
  await expect(training).toContainText("Aflyst");
  // The kind is in the name: no "Træning" label beside it.
  await expect(training.getByText("Træning", { exact: true })).toHaveCount(0);
});

test("an admin with no KampKlar link is pointed to the team settings; nobody else is", async ({ page, loginAs }) => {
  const { team, anna, admin } = await squad();
  await loginAs(anna);
  await page.goto("/aktiviteter");
  await expect(page.getByRole("link", { name: /KampKlar/ })).toHaveCount(0);

  await loginAs(admin);
  await page.goto("/aktiviteter");
  await page.getByRole("link", { name: /Hent kampene fra KampKlar/ }).click();
  await expect(page).toHaveURL(/\/hold$/);

  await db.team.update({ where: { id: team.id }, data: { calendarUrl: "https://example.com/cal.ics" } });
  await page.goto("/aktiviteter");
  await expect(page.getByRole("link", { name: /KampKlar/ })).toHaveCount(0);
});

test("a team with nothing behind it and nothing ahead sees an empty calendar", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/aktiviteter");
  await expect(page.getByText("Ingen kommende aktiviteter i kalenderen.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tidligere aktiviteter" })).toHaveCount(0);
});

test("an activity from KampKlar takes no sign-ups, links to KampKlar and shows who KampKlar says comes", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const link = "https://web.dbu.dk/fodboldapp?page=HOActivity&activityId=7334167";
  const match = await db.match.create({
    data: {
      teamId: team.id,
      title: "Swingkings - AB",
      opponent: "AB",
      startsAt: inDays(3),
      source: "KAMPKLAR",
      externalUid: "x",
      externalUrl: link,
      externalSignups: { going: ["Anna", "Gæst Gæstesen"], notGoing: ["Bo"], available: ["Kasserer"] },
    },
  });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("heading", { name: "Mod AB", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jeg kommer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Åbn i KampKlar/ })).toHaveAttribute("href", link);
  await expect(page.getByRole("heading", { name: "Kommer (2)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kommer ikke (1)" })).toBeVisible();
  // "Kasserer" in KampKlar is the one member whose name starts so.
  await expect(page.getByRole("heading", { name: "Til rådighed (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kasserer Kim" })).toBeVisible();
  // Only an admin is told about names nobody is linked to.
  await expect(page.getByText(/ikke koblet til en spiller/)).toHaveCount(0);
  // A teammate links to their page; a name nobody here has is only a name.
  await expect(page.getByRole("link", { name: "Anna", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gæst Gæstesen" })).toHaveCount(0);
  await expect(page.getByText("Gæst Gæstesen")).toHaveCount(1);
});

test("the list shows who comes, who is available and who has said no", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.match.create({
    data: {
      teamId: team.id,
      title: "Swingkings - AB",
      opponent: "AB",
      startsAt: inDays(3),
      source: "KAMPKLAR",
      externalUid: "x",
      externalSignups: { going: ["Anna", "Bo", "Carl"], notGoing: ["Dorte"], available: ["Eva", "Frede"] },
    },
  });
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const row = page.getByRole("link", { name: /AB/ });
  await expect(row.getByText("3 kommer", { exact: true })).toBeVisible();
  await expect(row.getByText("2 til rådighed", { exact: true })).toBeVisible();
  await expect(row.getByText("1 kommer ikke", { exact: true })).toBeVisible();
});

test("an admin links a member to their name in KampKlar, and their sign-up follows", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  const match = await db.match.create({
    data: {
      teamId: team.id,
      title: "Swingkings - AB",
      opponent: "AB",
      startsAt: inDays(3),
      source: "KAMPKLAR",
      externalUid: "x",
      externalSignups: { going: ["Thomas Træner-Hansen"], notGoing: [], available: [] },
    },
  });
  await loginAs(admin);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByText("1 navn fra KampKlar er ikke koblet til en spiller.")).toBeVisible();
  await page.getByRole("link", { name: "Kobl under Rettigheder ›" }).click();
  await expect(page).toHaveURL(/\/hold\/rettigheder$/);

  await page.getByRole("button", { name: "Handlinger for Træner Tom" }).click();
  await page.getByRole("dialog", { name: "Træner Tom" }).getByRole("button", { name: "Ret" }).click();
  const dialog = page.getByRole("dialog", { name: "Træner Tom" });
  await dialog.getByLabel("Navn i KampKlar").fill("Thomas Træner-Hansen");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db.teamMember.findFirst({ where: { userId: admin.id } }))?.kampklarName).toBe("Thomas Træner-Hansen");

  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("heading", { name: "Kommer (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Træner Tom" })).toBeVisible();
  await expect(page.getByText(/ikke koblet til en spiller/)).toHaveCount(0);
});

test("an activity from KampKlar whose feed carries no sign-ups says so", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({
    data: { teamId: team.id, title: "Træning", kind: "TRAINING", startsAt: inDays(3), source: "KAMPKLAR", externalUid: "y" },
  });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByText("KampKlar har ikke sendt tilmeldinger med til denne aktivitet endnu.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Åbn i KampKlar/ })).toHaveCount(0);
});

test("an activity's tabs are swiped or tapped between, each at its own address", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Swingkings - AB", opponent: "AB", startsAt: inDays(3), location: "Bane 3" } });
  await db.task.create({ data: { teamId: team.id, matchId: match.id, title: "Tøjvask", dueAt: inDays(3), assignees: { create: { userId: anna.id } } } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("tab", { name: "Detaljer" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: /Bane 3/ })).toHaveAttribute("href", /google\.com\/maps.*Bane%203/);
  // Your own open job is pointed out on the details, and a tap turns to the jobs.
  await page.getByRole("button", { name: /Din opgave: Tøjvask/ }).click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}/opgaver$`));
  await expect(page.getByRole("tab", { name: "Opgaver (1)" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Bøder" }).click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}/boder$`));
  await expect(page.getByText("Ingen bøder endnu.")).toBeVisible();

  // Opened straight on a tab, the page starts there.
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  await expect(page.getByRole("tab", { name: "Opgaver (1)" })).toHaveAttribute("aria-selected", "true");
  await expect(jobsTab(page).getByText("Tøjvask")).toBeVisible();
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
  // The standard jobs moved to the team settings, which send a player to the overview.
  await page.goto("/aktiviteter/standardopgaver");
  await expect(page).toHaveURL(/\/oversigt$/);
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
  await page.getByRole("tab", { name: /^Opgaver/ }).click();
  await expect(jobsTab(page).getByText("Købe nye bolde")).toBeVisible();

  await loginAs(bo);
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  await page.getByRole("button", { name: "Markér som udført" }).click();
  await expect.poll(async () => (await db.task.findFirst({ where: { title: "Købe nye bolde" } }))?.doneById).toBe(bo.id);
});

test("one \"Ny opgave\" puts standard jobs on an activity and copies jobs from an earlier one", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.taskTemplate.createMany({ data: [{ teamId: team.id, title: "Grill", people: 1 }, { teamId: team.id, title: "Frugt", people: 1 }] });
  const earlier = await db.match.create({ data: { teamId: team.id, title: "Swingkings - AB", opponent: "AB", startsAt: inDays(-7) } });
  await db.task.create({ data: { teamId: team.id, matchId: earlier.id, title: "Trøjevask", dueAt: inDays(-7) } });
  const match = await db.match.create({ data: { teamId: team.id, title: "Swingkings - B93", opponent: "B93", startsAt: inDays(3) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  const menu = page.getByRole("dialog", { name: "Handlinger" });
  await page.getByRole("button", { name: "Handlinger" }).click();
  // The three ways live inside the one dialog, not as rows of their own.
  await expect(menu.getByRole("button", { name: "Tilføj standardopgaver" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Kopiér opgaver" })).toHaveCount(0);
  await menu.getByRole("button", { name: "Ny opgave" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny opgave" });
  await expect(dialog.getByRole("button", { name: "Ny", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Standardopgaver" }).click();
  await dialog.getByRole("checkbox", { name: /Grill/ }).check();
  await dialog.getByRole("button", { name: "Tilføj og fordel" }).click();
  await expect(dialog).toBeHidden();
  await expect(jobsTab(page).getByText("Grill")).toBeVisible();
  await expect(page.getByText("Frugt")).toHaveCount(0);

  await page.getByRole("button", { name: "Handlinger" }).click();
  await menu.getByRole("button", { name: "Ny opgave" }).click();
  // It opens on a new job again, whatever was used last.
  await expect(dialog.getByLabel("Opgave")).toBeVisible();
  await dialog.getByRole("button", { name: "Kopiér" }).click();
  await dialog.getByLabel("Fra").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Kopiér og fordel" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => db.task.count({ where: { matchId: match.id } })).toBe(2);
  await expect(jobsTab(page).getByText("Trøjevask")).toBeVisible();
});

test("an activity with nothing to copy and no standard jobs offers only a new job", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: inDays(3) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog", { name: "Handlinger" }).getByRole("button", { name: "Ny opgave" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny opgave" });
  await expect(dialog.getByLabel("Opgave")).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Hvordan?" })).toHaveCount(0);
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
  await page.goto("/hold/opgaver");
  await page.getByRole("button", { name: "Ny standardopgave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Opgave").fill("Kørsel");
  await dialog.getByLabel("Antal personer").fill("3");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Kørsel/)).toBeVisible();
  expect(await db.taskTemplate.findFirst({ where: { teamId: team.id } })).toMatchObject({ title: "Kørsel", people: 3 });

  await loginAs(anna);
  await page.goto("/hold/opgaver");
  await expect(page).toHaveURL(/\/oversigt$/);
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

test("a player gives a job to a teammate, who accepts it, and the job keeps the history", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const task = await db.task.create({
    data: { teamId: team.id, title: "Tøjvask", dueAt: inDays(2), assignees: { create: { userId: anna.id } } },
  });
  await loginAs(anna);
  await page.goto(`/opgaver/${task.id}`);
  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog", { name: "Handlinger" }).getByRole("button", { name: "Giv opgaven videre" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv opgaven videre" });
  await dialog.getByLabel("Hvem skal overtage?").selectOption({ label: "Bo" });
  await dialog.getByLabel("Besked").fill("Jeg er ikke med til kampen");
  await dialog.getByRole("button", { name: "Spørg" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Du har spurgt Bo, om de vil overtage opgaven.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historik" })).toBeVisible();

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("link", { name: /Opgave tilbudt/ }).click();
  await expect(page).toHaveURL(new RegExp(`/opgaver/${task.id}$`));
  await expect(page.getByText("“Jeg er ikke med til kampen”").first()).toBeVisible();
  await page.getByRole("button", { name: "Ja, jeg tager den" }).click();
  await expect(page.getByRole("button", { name: "Ja, jeg tager den" })).toHaveCount(0);
  await expect(page.getByText("Godkendt")).toBeVisible();
  expect((await db.taskAssignee.findMany({ where: { taskId: task.id } })).map((a) => a.userId)).toEqual([bo.id]);
});

test("an activity's fines open as in the history, and their giver may delete one there", async ({ page, loginAs }) => {
  const { team, treasurer, anna, bo } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Kamp", opponent: "FC Naboen", startsAt: new Date(Date.now() - 86_400_000) } });
  await db.fine.create({ data: { teamId: team.id, matchId: match.id, playerId: bo.id, reason: "For sent", note: "Ti minutter", units: 2, unitPriceKr: 10, issuedById: anna.id } });
  // A fine from no activity stays off its page.
  await db.fine.create({ data: { teamId: team.id, playerId: bo.id, reason: "Glemt trøje", units: 1, unitPriceKr: 10, issuedById: treasurer.id } });

  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}/boder`);
  await expect(page.getByRole("tab", { name: "Bøder (1)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Glemt trøje")).toHaveCount(0);
  await page.getByRole("button", { name: /Bo · For sent/ }).click();
  const sheet = page.getByRole("dialog", { name: "Bøde" });
  await expect(sheet.getByText("Ti minutter")).toBeVisible();
  await expect(sheet.getByText(/FC Naboen ·/)).toBeVisible();
  await sheet.getByRole("button", { name: "Slet bøden" }).click();
  await page.getByRole("dialog", { name: "Slet bøden til Bo?" }).getByRole("button", { name: "Slet bøden" }).click();
  await expect(page.getByText("Ingen bøder endnu.")).toBeVisible();
  expect(await db.fine.count({ where: { matchId: match.id } })).toBe(0);
});
