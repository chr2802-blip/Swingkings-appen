import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";
import { tapProblems } from "./helpers/tap-audit";

/**
 * Everything a person can press answers the press, and is big enough to hit: the demo
 * team (a season's worth of everything) opened page by page, and every visible button,
 * link, tab and choice measured as the browser lays it out (`helpers/tap-audit.ts`).
 */
async function audit(page: Page, paths: string[]) {
  const found: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("load");
    for (const { what, problem } of await tapProblems(page)) found.push(`${path}  ${what}: ${problem}`);
  }
  return [...new Set(found)];
}

/** The same, in a sheet opened on a page: measured once it has finished moving in. */
async function auditSheet(page: Page, path: string, open: () => Promise<unknown>, then?: () => Promise<unknown>) {
  await page.goto(path);
  await open();
  const sheet = page.getByRole("dialog").last();
  await expect(sheet).toBeVisible();
  const settled = () => sheet.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await settled();
  if (then) {
    await then();
    await settled();
  }
  return (await tapProblems(page)).map(({ what, problem }) => `${path} (sheet)  ${what}: ${problem}`);
}

async function demoTeam(page: Page, loginAs: (user: { id: string }) => Promise<Page>) {
  const { team } = await squad();
  const root = await db.user.create({
    data: { email: "root@e2e.dk", name: "Root", passwordHash: "x", role: "SUPER_ADMIN", activeTeamId: team.id },
  });
  await loginAs(root);
  await page.goto("/admin/testdata");
  await page.getByRole("button", { name: "Opret testhold" }).click();
  // The sheet closes once the whole season has been written.
  await page.getByRole("dialog").getByRole("button", { name: "Opret testhold" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60_000 });
  await page.goto("/admin/hold");
  await expect(page.getByText(/^18 spillere · \d+ aktiviteter/)).toBeVisible();
  const demo = await db.team.findFirstOrThrow({ where: { isDemo: true } });
  const admin = await db.teamMember.findFirstOrThrow({ where: { teamId: demo.id, role: "ADMIN" }, include: { user: true } });
  await db.user.update({ where: { id: admin.userId }, data: { activeTeamId: demo.id } });
  return { root, demo, admin: admin.user };
}

test("every button and link on the team's pages presses in and is at least 32 by 32", async ({ page, loginAs }) => {
  test.setTimeout(180_000);
  const { demo, admin } = await demoTeam(page, loginAs);
  const now = new Date();
  const past = await db.match.findFirstOrThrow({ where: { teamId: demo.id, startsAt: { lt: now }, tasks: { some: {} } }, orderBy: { startsAt: "desc" } });
  const next = await db.match.findFirstOrThrow({ where: { teamId: demo.id, startsAt: { gt: now } }, orderBy: { startsAt: "asc" } });
  const task = await db.task.findFirstOrThrow({ where: { teamId: demo.id, assignees: { some: {} } } });
  const player = await db.teamMember.findFirstOrThrow({ where: { teamId: demo.id, role: "PLAYER" } });

  await loginAs(admin);
  const problems = await audit(page, [
    "/oversigt",
    "/aktiviteter",
    `/aktiviteter/${next.id}`,
    `/aktiviteter/${past.id}`,
    `/aktiviteter/${past.id}/opgaver`,
    `/aktiviteter/${past.id}/boder`,
    "/aktiviteter/standardopgaver",
    `/opgaver/${task.id}`,
    "/boder",
    "/boder/historik",
    "/boder/katalog",
    "/boder/udfordringer",
    `/boder/spiller/${player.userId}`,
    "/chat",
    "/hold",
    "/hold/besked",
    "/hold/betaling",
    "/hold/inviter",
    "/hold/opgaver",
    "/hold/rettigheder",
    "/hold/saeson",
    "/hold/saesoner",
    "/hold/spillere",
    "/profil",
    `/spiller/${player.userId}`,
    `/spiller/${player.userId}/boder`,
    `/spiller/${player.userId}/opgaver`,
    `/spiller/${admin.id}`,
  ]);

  // The sheets a press opens: the "+", the bell and its settings, a fine, a challenge waiting, a job.
  problems.push(
    ...(await auditSheet(page, "/oversigt", () => page.locator("button.app-create").click())),
    ...(await auditSheet(page, "/oversigt", () => page.getByRole("button", { name: /^Notifikationer/ }).click())),
    ...(await auditSheet(
      page,
      "/oversigt",
      () => page.getByRole("button", { name: /^Notifikationer/ }).click(),
      () => page.getByRole("tab", { name: "Indstillinger" }).click(),
    )),
    ...(await auditSheet(page, "/boder/historik", () => page.getByRole("button", { name: /^Bøde / }).first().click())),
    ...(await auditSheet(
      page,
      "/boder/historik",
      () => page.getByRole("button", { name: /^Udfordring .*Venter$/ }).first().click(),
      // Fetched when opened: measured once its buttons are there.
      () => expect(page.getByRole("dialog").last().getByText("Meldt af")).toBeVisible(),
    )),
    ...(await auditSheet(page, `/aktiviteter/${next.id}`, () => page.locator("button.app-create").click())),
    ...(await auditSheet(page, "/aktiviteter", () => page.getByRole("button", { name: "Ny aktivitet" }).click())),
  );
  expect(problems).toEqual([]);
});

test("the super admin's page and the pages before signing in press in and are at least 32 by 32", async ({ page, loginAs, context }) => {
  test.setTimeout(120_000);
  const { team } = await squad();
  const root = await db.user.create({
    data: { email: "root@e2e.dk", name: "Root", passwordHash: "x", role: "SUPER_ADMIN", activeTeamId: team.id },
  });
  await loginAs(root);
  const club = await db.club.create({ data: { name: "Swingkings FC" } });
  await db.team.update({ where: { id: team.id }, data: { clubId: club.id } });
  const signedIn = await audit(page, ["/admin", "/admin/hold", "/admin/logoer", "/admin/testdata", `/admin/klubber/${club.id}`, `/admin/klubber/${club.id}/admins`, `/admin/klubber/${club.id}/indstillinger`, "/hold/vaelg"]);

  await context.clearCookies();
  const signedOut = await audit(page, ["/login", "/privatliv", "/hent-appen"]);
  expect([...signedIn, ...signedOut]).toEqual([]);
});
