import { test, expect } from "./helpers/fixtures";
import { PASSWORD, db, squad } from "./helpers/database";

test("logs in with the real form and lands on the overview", async ({ page }) => {
  const { anna } = await squad();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(anna.email.toUpperCase());
  await page.getByLabel("Adgangskode").fill(PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/oversigt$/);
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
  for (const path of ["/oversigt", "/boder", "/kampe", "/opgaver", "/chat", "/hold", "/profil", "/admin"]) {
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

test("joins a team with an invitation code and is signed in", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("ny@e2e.dk");
  await page.getByRole("button", { name: "Lav invitation" }).click();
  const note = page.getByText(/Koden er /);
  await expect(note).toBeVisible();
  const code = /Koden er (\S+)\./.exec((await note.textContent()) ?? "")![1]!;

  await page.context().clearCookies();
  await page.goto("/accept-invite");
  await page.getByLabel("E-mail").fill("ny@e2e.dk");
  await page.getByLabel("Invitationskode").fill(code);
  await page.getByLabel("Dit navn").fill("Nye Nina");
  await page.getByLabel("Adgangskode").fill("et-langt-kodeord");
  await page.getByRole("button", { name: "Kom med på holdet" }).click();
  await expect(page).toHaveURL(/\/oversigt$/);
  expect(await db.user.count({ where: { email: "ny@e2e.dk", memberships: { some: {} } } })).toBe(1);
});
