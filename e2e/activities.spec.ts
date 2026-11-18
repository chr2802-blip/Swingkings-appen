import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";
import { hold, holdAndChoose } from "./helpers/hold";
import { choose, chooseMany } from "./helpers/select";

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
  await expect(page.getByRole("button", { name: "Jeg kommer", exact: true })).toHaveAttribute("aria-pressed", "true");
  // The chosen button says it; no line above repeats it.
  await expect(page.getByText("Kommer du?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Jeg kommer ikke" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Tilmeldte (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Anna", exact: true })).toBeVisible();

  await loginAs(bo);
  await page.goto(`/aktiviteter/${party.id}`);
  await page.getByRole("button", { name: "Jeg kommer ikke" }).click();
  await expect(page.getByRole("button", { name: "Jeg kommer ikke" })).toHaveAttribute("aria-pressed", "true");
  // Only those coming are shown: Bo's no is not.
  await expect(page.getByRole("heading", { name: "Tilmeldte (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bo", exact: true })).toHaveCount(0);
  expect(await db.activitySignup.findMany({ where: { matchId: party.id }, orderBy: { going: "desc" }, select: { userId: true, going: true } })).toEqual([
    { userId: anna.id, going: true },
    { userId: bo.id, going: false },
  ]);

  await page.goto("/aktiviteter");
  // On the row: a green circle for the one coming, a red for the one not.
  const row = page.getByRole("link", { name: /Afslutningsfest/ });
  await expect(row.getByText("1 tilmeldt", { exact: true })).toBeVisible();
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
  // Jobs are on the activity, not on its row.
  await expect(ab).not.toContainText("opgave");
  const b93 = page.getByRole("link", { name: /B93/ });
  await expect(b93).toContainText("Ude");
  await expect(b93).not.toContainText("opgave");
  const training = page.getByRole("link", { name: /Tirsdagstræning/ });
  await expect(training).toContainText("Aflyst");
  // The kind is in the name: no "Træning" label beside it.
  await expect(training.getByText("Træning", { exact: true })).toHaveCount(0);
});

test("\"Tilføj til kalender\" gives a link the calendar subscribes to, which works without logging in", async ({ page, loginAs, request }) => {
  const { team, anna } = await squad();
  await db.team.update({ where: { id: team.id }, data: { calendarUrl: "https://kampklar.example/feed.ics" } });
  await db.match.create({ data: { teamId: team.id, kind: "MATCH", title: "Swingkings - AB", opponent: "AB", isHome: true, startsAt: inDays(3) } });
  await loginAs(anna);
  await page.goto("/aktiviteter");
  // KampKlar is fetched by itself: there is no button for it here.
  await expect(page.getByRole("button", { name: "Hent fra KampKlar" })).toHaveCount(0);

  await page.getByRole("button", { name: "Tilføj til kalender" }).click();
  const dialog = page.getByRole("dialog", { name: "Tilføj til kalender" });
  const subscribe = dialog.getByRole("link", { name: /Abonnér/ });
  await expect(subscribe).toHaveAttribute("href", /^webcal:\/\/127\.0\.0\.1:\d+\/api\/calendar\/[\w.-]+\.ics$/);
  await expect(dialog.getByRole("link", { name: /Google Kalender/ })).toHaveAttribute("href", /calendar\.google\.com.*webcal/);

  const link = await dialog.getByLabel("Kalenderlink").inputValue();
  // The calendar app has no session: `request` carries no cookie.
  const feed = await request.get(link.replace(/^https:/, "http:"));
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain("SUMMARY:Hjemme mod AB");
  expect((await request.get(link.replace(/\.ics$/, "x.ics").replace(/^https:/, "http:"))).status()).toBe(404);
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

test("an activity from KampKlar takes no sign-ups, links to KampKlar and shows only those signed up there", async ({ page, loginAs }) => {
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
      externalSignups: { going: ["Anna", "Gæst Gæstesen", "Kasserer"], notGoing: ["Bo"] },
    },
  });
  await db.team.update({ where: { id: team.id }, data: { calendarSyncedAt: new Date("2026-11-16T19:30:00Z") } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("heading", { name: "Mod AB", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jeg kommer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Åbn i KampKlar/ })).toHaveAttribute("href", link);
  // When the feed was last read, in Danish time (20:30 in Copenhagen is 19:30 UTC in November).
  await expect(page.getByText(/^Hentet fra KampKlar 16\. nov\.? kl\. 20:30$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tilmeldte (3)" })).toBeVisible();
  // "Kasserer" in KampKlar is the one member whose name starts so.
  await expect(page.getByRole("link", { name: "Kasserer Kim" })).toBeVisible();
  // Nobody else: not Bo's afbud, nor those who have not answered.
  await expect(page.getByRole("link", { name: "Bo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Træner Tom" })).toHaveCount(0);
  await expect(page.getByText(/Tilmelding sker i KampKlar|ikke svaret|ikke koblet/)).toHaveCount(0);
  // A teammate links to their page; a name nobody here has is only a name.
  await expect(page.getByRole("link", { name: "Anna", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gæst Gæstesen" })).toHaveCount(0);
  await expect(page.getByText("Gæst Gæstesen")).toHaveCount(1);
});

test("the list shows how many have signed up in KampKlar in a green circle, and nothing else", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  await db.match.create({
    data: {
      teamId: team.id,
      title: "Swingkings - AB",
      opponent: "AB",
      startsAt: inDays(3),
      source: "KAMPKLAR",
      externalUid: "x",
      externalSignups: { going: ["Anna", "Bo", "Carl"], notGoing: ["Dorte"] },
    },
  });
  await loginAs(anna);
  await page.goto("/aktiviteter");
  const row = page.getByRole("link", { name: /AB/ });
  await expect(row.getByText("3 tilmeldt", { exact: true })).toBeVisible();
  await expect(row.getByText(/kommer ikke/)).toHaveCount(0);
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
      externalSignups: { going: ["Thomas Træner-Hansen"], notGoing: [] },
    },
  });
  await loginAs(admin);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("link", { name: "Træner Tom" })).toHaveCount(0);
  await page.goto("/hold/rettigheder");

  await page.getByRole("button", { name: "Handlinger for Træner Tom" }).click();
  await page.getByRole("dialog", { name: "Træner Tom" }).getByRole("button", { name: "Ret" }).click();
  const dialog = page.getByRole("dialog", { name: "Træner Tom" });
  await dialog.getByLabel("Navn i KampKlar").fill("Thomas Træner-Hansen");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db.teamMember.findFirst({ where: { userId: admin.id } }))?.kampklarName).toBe("Thomas Træner-Hansen");

  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("heading", { name: "Tilmeldte (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Træner Tom" })).toBeVisible();
});

test("an activity from KampKlar whose feed carries no sign-ups has nobody signed up", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({
    data: { teamId: team.id, title: "Træning", kind: "TRAINING", startsAt: inDays(3), source: "KAMPKLAR", externalUid: "y" },
  });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByText("Ingen tilmeldte endnu.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Åbn i KampKlar/ })).toHaveCount(0);
  await expect(page.getByText("Ikke hentet fra KampKlar endnu")).toBeVisible();
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
  await page.getByRole("button", { name: "Opret" }).click();
  await page.getByRole("dialog", { name: "Opret" }).getByRole("button", { name: "Ny opgave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Opgave").fill("Købe nye bolde");
  await choose(dialog.getByLabel("Hvem skal gøre det?"), "Jeg vælger selv");
  await chooseMany(dialog.getByLabel("Hvem?"), ["Bo"]);
  await dialog.getByRole("button", { name: "Opret opgave" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("tab", { name: /^Opgaver/ }).click();
  await expect(jobsTab(page).getByText("Købe nye bolde")).toBeVisible();
  // Anna is not on it: she sees the tick, but cannot press it.
  await expect(jobsTab(page).getByRole("img", { name: "Ikke udført" })).toBeVisible();
  await expect(jobsTab(page).getByRole("button", { name: "Markér som udført" })).toHaveCount(0);

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
  const menu = page.getByRole("dialog", { name: "Opret" });
  await page.getByRole("button", { name: "Opret" }).click();
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

  await page.getByRole("button", { name: "Opret" }).click();
  await menu.getByRole("button", { name: "Ny opgave" }).click();
  // It opens on a new job again, whatever was used last.
  await expect(dialog.getByLabel("Opgave")).toBeVisible();
  await dialog.getByRole("button", { name: "Kopiér" }).click();
  await choose(dialog.getByLabel("Fra"), /AB/, { search: "ab" });
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
  await page.getByRole("button", { name: "Opret" }).click();
  await page.getByRole("dialog", { name: "Opret" }).getByRole("button", { name: "Ny opgave" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny opgave" });
  await expect(dialog.getByLabel("Opgave")).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Hvordan?" })).toHaveCount(0);
});

test("a job opens in a sheet that says what it belongs to; nobody puts themselves on it", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const match = await db.match.create({
    data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: inDays(3), location: "Klubhuset" },
  });
  const task = await db.task.create({
    data: { teamId: team.id, matchId: match.id, title: "Kage til festen", description: "Gerne chokolade", dueAt: inDays(2), assignees: { create: { userId: anna.id } } },
  });
  await loginAs(bo);
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  await jobsTab(page).getByRole("button", { name: /^Kage til festen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kage til festen" });
  await expect(sheet.getByText("Opgave til aktivitet")).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Afslutningsfest/ })).toBeVisible();
  await expect(sheet.getByText("📍 Klubhuset")).toBeVisible();
  await expect(sheet.getByText("Gerne chokolade")).toBeVisible();
  // Nobody can put themselves on a job; only those on it finish or give it away.
  for (const name of ["Jeg tager den", "Markér som udført ✓", "Giv videre", "Ret opgave"]) {
    await expect(sheet.getByRole("button", { name })).toHaveCount(0);
  }
  await sheet.getByRole("link", { name: /Afslutningsfest/ }).click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}$`));

  // A job's old address opens the same sheet over the activity's jobs.
  await page.goto(`/opgaver/${task.id}`);
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}/opgaver\\?opgave=${task.id}$`));
  await expect(page.getByRole("dialog", { name: "Kage til festen" })).toBeVisible();
  await page.getByRole("dialog", { name: "Kage til festen" }).getByRole("button", { name: "Luk" }).click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}/opgaver$`));
});

test("a player gives a job away in the chat, and a teammate follows the link and takes it over", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: inDays(3) } });
  const task = await db.task.create({
    data: { teamId: team.id, matchId: match.id, title: "Kage til kampen", dueAt: inDays(2), assignees: { create: { userId: anna.id } } },
  });

  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  await jobsTab(page).getByRole("button", { name: /^Kage til kampen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kage til kampen" });
  await sheet.getByRole("button", { name: "Giv videre" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv opgaven videre" });
  await expect(dialog.getByLabel("Hele holdet i chatten")).toBeChecked();
  await dialog.getByLabel("Besked (valgfri)").fill("Jeg er på ferie");
  await dialog.getByRole("button", { name: "Spørg" }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByText("Søger en afløser i chatten")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Træk tilbage" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Giv videre" })).toHaveCount(0);
  // The row under the sheet says so too. (Closing the sheet steps back in the history a
  // moment later, which would abort the navigation below.)
  await expect(jobsTab(page).getByText("Søger afløser")).toBeVisible();

  await loginAs(bo);
  await page.goto("/chat");
  await expect(page.getByText("Jeg er på ferie")).toBeVisible();
  await page.getByRole("link", { name: /Kage til kampen · Se opgaven/ }).click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}/opgaver\\?opgave=${task.id}$`));
  const opened = page.getByRole("dialog", { name: "Kage til kampen" });
  await opened.getByRole("button", { name: "Jeg tager den" }).click();
  await expect(opened.getByRole("button", { name: "Markér som udført ✓" })).toBeVisible();
  await expect(opened.getByRole("button", { name: "Jeg tager den" })).toHaveCount(0);
  await opened.getByText("Historik (1)").click();
  await expect(opened.getByText("Anna → Bo (via chatten)")).toBeVisible();
  expect((await db.taskAssignee.findMany({ where: { taskId: task.id } })).map((a) => a.userId)).toEqual([bo.id]);
});

test("whoever made a job deletes it from its sheet and stays on the activity's jobs", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: inDays(3) } });
  await db.task.create({ data: { teamId: team.id, matchId: match.id, title: "Grill", createdById: anna.id, dueAt: inDays(2) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  await jobsTab(page).getByRole("button", { name: /^Grill/ }).click();
  await page.getByRole("dialog", { name: "Grill" }).getByRole("button", { name: "Slet opgave" }).click();
  await page.getByRole("dialog", { name: "Slet opgaven?" }).getByRole("button", { name: "Slet opgaven" }).click();
  await expect(page.getByRole("dialog", { name: "Grill" })).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}/opgaver$`));
  await expect(jobsTab(page).getByText("Ingen opgaver endnu.", { exact: false })).toBeVisible();
  expect(await db.task.count()).toBe(0);
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

test("an activity's \"+\" makes a job or gives a fine, and hands over to the dialog it opens", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: inDays(3) } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await expect(page.getByRole("button", { name: "Handlinger" })).toHaveCount(0);
  for (const name of ["Ny opgave", "Giv bøde"]) await expect(page.getByRole("button", { name })).toHaveCount(0);
  // A hand-made activity is changed or deleted at the foot of its details.
  await expect(page.getByRole("button", { name: "Ret aktivitet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Slet aktivitet" })).toBeVisible();

  await page.getByRole("button", { name: "Opret" }).click();
  const menu = page.getByRole("dialog", { name: "Opret" });
  for (const name of ["Ny opgave", "Giv bøde"]) await expect(menu.getByRole("button", { name })).toBeVisible();
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
  const match = await db.match.create({ data: { teamId: team.id, title: "Afslutningsfest", kind: "OTHER", startsAt: inDays(3) } });
  const task = await db.task.create({
    data: { teamId: team.id, matchId: match.id, title: "Tøjvask", dueAt: inDays(2), assignees: { create: { userId: anna.id } } },
  });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}/opgaver`);
  await jobsTab(page).getByRole("button", { name: /^Tøjvask/ }).click();
  const sheet = page.getByRole("dialog", { name: "Tøjvask" });
  await sheet.getByRole("button", { name: "Giv videre" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv opgaven videre" });
  await dialog.getByRole("radio", { name: "Bo", exact: true }).check();
  await dialog.getByLabel("Besked (valgfri)").fill("Jeg er ikke med til kampen");
  await dialog.getByRole("button", { name: "Spørg" }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByText("Venter på svar fra Bo")).toBeVisible();
  await expect(sheet.getByText("Historik (1)")).toBeVisible();

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("link", { name: /Opgave tilbudt/ }).click();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}/opgaver\\?opgave=${task.id}$`));
  const opened = page.getByRole("dialog", { name: "Tøjvask" });
  await expect(opened.getByText("“Jeg er ikke med til kampen”").first()).toBeVisible();
  await opened.getByRole("button", { name: "Ja, jeg tager den" }).click();
  await expect(opened.getByRole("button", { name: "Ja, jeg tager den" })).toHaveCount(0);
  await opened.getByText("Historik (1)").click();
  await expect(opened.getByText("Godkendt")).toBeVisible();
  expect((await db.taskAssignee.findMany({ where: { taskId: task.id } })).map((a) => a.userId)).toEqual([bo.id]);
});

test("the team comments on an activity under its details, answers and reacts, and older comments fold away", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const party = await db.match.create({ data: { teamId: team.id, kind: "OTHER", title: "Afslutningsfest", startsAt: inDays(10) } });
  const details = page.getByRole("tabpanel", { name: /^Detaljer/ });

  await loginAs(anna);
  await page.goto(`/aktiviteter/${party.id}`);
  await expect(details.getByRole("heading", { name: "Kommentarer (0)" })).toBeVisible();
  await expect(details.getByText("Ingen kommentarer endnu")).toBeVisible();
  await details.getByRole("textbox", { name: "Kommentar" }).fill("Skal vi have DJ?");
  await details.getByRole("button", { name: "Send" }).click();
  await expect(details.getByRole("heading", { name: "Kommentarer (1)" })).toBeVisible();
  await expect(details.getByText("Skal vi have DJ?")).toBeVisible();
  await expect(details.getByRole("textbox", { name: "Kommentar" })).toHaveValue("");

  await loginAs(bo);
  await page.goto(`/aktiviteter/${party.id}`);
  await holdAndChoose(page, details.getByText("Skal vi have DJ?"), "Svar");
  const answer = details.getByRole("textbox", { name: "Svar" });
  await expect(answer).toHaveValue("@Anna ");
  await answer.pressSequentially("Jeg har en højttaler");
  await details.getByRole("button", { name: "Send" }).click();
  await expect(details.getByRole("list", { name: "Svar til Anna" }).getByText("Jeg har en højttaler")).toBeVisible();
  // Bo may delete his own answer, not Anna's comment.
  await hold(page, details.getByText("Skal vi have DJ?"));
  await expect(page.getByRole("group", { name: "Handlinger" }).getByRole("button", { name: "Slet" })).toHaveCount(0);
  await page.getByRole("group", { name: "Vælg en reaktion" }).getByRole("button", { name: "Ild 🔥" }).click();
  await expect(details.getByRole("button", { name: "1 reaktion: Bo har reageret" })).toBeVisible();
  await expect.poll(() => db.reaction.count({ where: { activityCommentId: { not: null }, kind: "FIRE", userId: bo.id } })).toBe(1);

  // Five comments: folded together, the latest two show, and the rest are one press away.
  for (const [index, body] of ["Mad kl. 19", "Husk pokalerne", "Jeg tager kage med"].entries()) {
    await db.activityComment.create({ data: { teamId: team.id, matchId: party.id, authorId: anna.id, body, createdAt: new Date(Date.now() + (index + 1) * 1000) } });
  }
  await page.reload();
  await expect(details.getByRole("heading", { name: "Kommentarer (5)" })).toBeVisible();
  await expect(details.getByText("Jeg tager kage med")).toBeVisible();
  await expect(details.getByText("Husk pokalerne")).toBeVisible();
  await expect(details.getByText("Skal vi have DJ?")).toBeHidden();
  const fold = details.getByRole("button", { name: "Vis alle 5" });
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await details.getByRole("button", { name: "Se 3 tidligere kommentarer" }).click();
  await expect(details.getByText("Skal vi have DJ?")).toBeVisible();
  await expect(details.getByRole("button", { name: "Skjul ældre" })).toHaveAttribute("aria-expanded", "true");

  // The phone remembers it was folded out, and folds it back on a press.
  await page.reload();
  await expect(details.getByText("Skal vi have DJ?")).toBeVisible();
  await details.getByRole("button", { name: "Skjul ældre" }).click();
  await expect(details.getByText("Skal vi have DJ?")).toBeHidden();
  await page.reload();
  await expect(details.getByRole("button", { name: "Vis alle 5" })).toBeVisible();
  await expect(details.getByText("Skal vi have DJ?")).toBeHidden();
});

test("a long note is folded to a few lines with Vis mere, a short one is shown whole", async ({ page, loginAs }) => {
  const { team, anna } = await squad();
  const long = Array.from({ length: 12 }, (_, i) => `Linje ${i + 1}: husk det hele`).join("\n");
  const party = await db.match.create({ data: { teamId: team.id, kind: "OTHER", title: "Afslutningsfest", startsAt: inDays(10), note: long } });
  const training = await db.match.create({ data: { teamId: team.id, kind: "TRAINING", title: "Træning", startsAt: inDays(2), note: "Medbring bolde" } });
  const details = page.getByRole("tabpanel", { name: /^Detaljer/ });

  await loginAs(anna);
  await page.goto(`/aktiviteter/${party.id}`);
  await expect(details.getByText(/^Linje 1: husk det hele/)).toBeVisible();
  const more = details.getByRole("button", { name: "Vis mere" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  // Folded, the note is cut off: shorter than its text.
  const note = details.getByText(/^Linje 1: husk det hele/);
  await expect.poll(() => note.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await more.click();
  await expect(details.getByRole("button", { name: "Vis mindre" })).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => note.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(false);
  await details.getByRole("button", { name: "Vis mindre" }).click();
  await expect(details.getByRole("button", { name: "Vis mere" })).toBeVisible();
  // The comments sit in the same card, under the details.
  await expect(details.getByRole("heading", { name: "Kommentarer (0)" })).toBeVisible();

  await page.goto(`/aktiviteter/${training.id}`);
  await expect(details.getByText("Medbring bolde")).toBeVisible();
  // Two days off, the day is said as words beside the time.
  await expect(details.getByText("· om 2 dage")).toBeVisible();
  await expect(details.getByRole("button", { name: "Vis mere" })).toHaveCount(0);
});

test("a fine given from an activity opens the fine box's history, with the new fine pulsing", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const match = await db.match.create({ data: { teamId: team.id, title: "Kamp", opponent: "FC Naboen", startsAt: inDays(3) } });
  await db.fineType.create({ data: { teamId: team.id, name: "Glemt benskinner", units: 1 } });
  await loginAs(anna);
  await page.goto(`/aktiviteter/${match.id}`);
  await page.getByRole("button", { name: "Opret" }).click();
  await page.getByRole("dialog", { name: "Opret" }).getByRole("button", { name: "Giv bøde" }).click();
  const dialog = page.getByRole("dialog", { name: "Giv bøde" });
  await chooseMany(dialog.getByLabel("Hvem?"), ["Bo"]);
  await choose(dialog.getByLabel("Bøde fra kataloget"), "Glemt benskinner (1 bøde)");
  await dialog.getByRole("button", { name: "Giv bøde" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/boder\/historik$/);
  const row = page.getByRole("tabpanel", { name: "Historik" }).locator("li").filter({ hasText: "Glemt benskinner" });
  await expect(row).toHaveClass(/fresh-pulse/);
  expect(await db.fine.findFirstOrThrow({ where: { playerId: bo.id } })).toMatchObject({ matchId: match.id, issuedById: anna.id });
  // Back goes to the activity it was given from, not to a sheet left behind.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/aktiviteter/${match.id}$`));
});
