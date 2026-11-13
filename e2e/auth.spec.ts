import { test, expect } from "./helpers/fixtures";
import { PASSWORD, db, squad } from "./helpers/database";

test("logs in with the real form on a phone without the app, is offered the app, and can go on to the team", async ({ page }) => {
  const { anna } = await squad();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(anna.email);
  await page.getByLabel("Adgangskode").fill(PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/hent-appen$/);
  await expect(page.getByRole("heading", { name: "Velkommen, Anna!" })).toBeVisible();
  await page.getByRole("link", { name: "Fortsæt til holdet, Anna →" }).click();
  await expect(page).toHaveURL(/\/oversigt$/);
});

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" });

  test("logs in with the real form and lands on the overview", async ({ page }) => {
    const { anna } = await squad();
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(anna.email.toUpperCase());
    await page.getByLabel("Adgangskode").fill(PASSWORD);
    await page.getByRole("button", { name: "Log ind" }).click();
    await expect(page).toHaveURL(/\/oversigt$/);
  });
});

test("says so when the password is wrong, without saying which half was", async ({ page }) => {
  const { anna } = await squad();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(anna.email);
  await page.getByLabel("Adgangskode").fill("forkert-kodeord");
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page.getByText("Forkert e-mail eller adgangskode.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("sends a signed-out visitor from every section to the login page", async ({ page }) => {
  for (const path of ["/oversigt", "/boder", "/aktiviteter", "/kampe", "/opgaver", "/chat", "/hold", "/profil", "/spiller/x", "/admin", "/hent-appen"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/);
  }
});

test("logs out", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/profil");
  await page.getByRole("button", { name: /Log ud/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/oversigt");
  await expect(page).toHaveURL(/\/login$/);
});

test("an admin makes an invitation link, and somebody new joins the team through it", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  await page.getByLabel("Højst antal personer").selectOption("5");
  await page.getByRole("button", { name: "Lav invitationslink" }).click();
  const link = page.getByRole("textbox", { name: "Invitationslink" });
  await expect(link).toHaveValue(/\/join\/[\w-]+$/);
  const path = new URL(await link.inputValue()).pathname;
  const token = path.slice("/join/".length);

  await page.context().clearCookies();
  await page.goto(`/join/${token}`);
  await expect(page.getByRole("heading", { name: `Kom med på ${team.name}` })).toBeVisible();
  await page.getByLabel("Dit navn").fill("Nye Nina");
  await page.getByLabel("E-mail").fill("ny@e2e.dk");
  await page.getByLabel("Adgangskode").fill("et-langt-kodeord");
  await page.getByRole("button", { name: "Opret mig og kom med" }).click();
  // A phone without the app is offered it first.
  await expect(page).toHaveURL(/\/hent-appen$/);
  expect(await db.teamMember.findFirst({ where: { teamId: team.id, user: { email: "ny@e2e.dk" } } })).toMatchObject({ role: "PLAYER" });
  expect(await db.inviteLink.findFirst({ where: { teamId: team.id } })).toMatchObject({ uses: 1, maxUses: 5 });
});

test("a link that does not work says so instead of showing the form", async ({ page }) => {
  await page.goto(`/join/${"x".repeat(43)}`);
  await expect(page.getByText(/Linket virker ikke/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Opret mig og kom med" })).toHaveCount(0);
});
