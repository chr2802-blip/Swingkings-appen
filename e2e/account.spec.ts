import { test, expect } from "./helpers/fixtures";
import { PASSWORD, db, squad } from "./helpers/database";

test("an admin gives a forgotten password a temporary one, and the member chooses their own at login", async ({ page, loginAs, browser }) => {
  const { admin, anna } = await squad();
  await loginAs(admin);
  await page.goto("/hold/rettigheder");
  await page.getByRole("button", { name: "Handlinger for Anna" }).click();
  await page.getByRole("button", { name: "Nulstil adgangskode" }).click();
  const drawer = page.getByRole("dialog", { name: "Ny adgangskode til Anna" });
  await drawer.getByRole("button", { name: "Lav midlertidig kode" }).click();
  const shown = drawer.getByLabel("Midlertidig adgangskode");
  await expect(shown).toHaveText(/^[a-z2-9]{10}$/);
  const temporary = (await shown.textContent())!;
  await drawer.getByRole("button", { name: "Færdig" }).click();
  await expect(drawer).toBeHidden();

  // Anna, on her own phone.
  const phone = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "da-DK" });
  const annas = await phone.newPage();
  await annas.goto("/login");
  await annas.getByLabel("E-mail").fill(anna.email);
  await annas.getByLabel("Adgangskode").fill(temporary);
  await annas.getByRole("button", { name: "Log ind" }).click();
  await expect(annas).toHaveURL(/\/ny-adgangskode$/);

  // Nowhere else in the app until it is chosen.
  await annas.goto("/oversigt");
  await expect(annas).toHaveURL(/\/ny-adgangskode$/);

  await annas.getByLabel("Ny adgangskode").fill("annas-egen-kode");
  await annas.getByRole("button", { name: "Gem adgangskode" }).click();
  await expect(annas).toHaveURL(/\/oversigt$/);
  expect((await db.user.findUniqueOrThrow({ where: { id: anna.id } })).mustChangePassword).toBe(false);

  await annas.goto("/ny-adgangskode");
  await expect(annas).toHaveURL(/\/oversigt$/);
  await phone.close();
});

test("a member deletes their own account from the profile, giving the password", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/profil");
  await page.getByRole("button", { name: "Slet min konto" }).click();
  const drawer = page.getByRole("dialog", { name: "Slet din konto?" });
  await drawer.getByLabel("Din adgangskode").fill("forkert-kodeord");
  await drawer.getByRole("button", { name: "Slet kontoen" }).click();
  await expect(drawer.getByRole("alert")).toHaveText("Adgangskoden er forkert.");

  await drawer.getByLabel("Din adgangskode").fill(PASSWORD);
  await drawer.getByRole("button", { name: "Slet kontoen" }).click();
  await expect(page).toHaveURL(/\/login\?slettet=1$/);
  await expect(page.getByRole("status")).toHaveText("Din konto er slettet.");
  expect(await db.user.findUnique({ where: { id: anna.id } })).toBeNull();
});

test("the last admin is told to hand over before deleting", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/profil");
  await page.getByRole("button", { name: "Slet min konto" }).click();
  const drawer = page.getByRole("dialog", { name: "Slet din konto?" });
  await drawer.getByLabel("Din adgangskode").fill(PASSWORD);
  await drawer.getByRole("button", { name: "Slet kontoen" }).click();
  await expect(drawer.getByRole("alert")).toContainText("Gør en anden til admin først.");
  expect(await db.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
});

test("the privacy page is open to anybody, from the login page", async ({ page }) => {
  await page.goto("/privatliv");
  await expect(page.getByRole("heading", { name: "Hvad der gemmes" })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByText("Glemt adgangskoden? Bed holdets admin om en midlertidig.")).toBeVisible();
  await page.getByRole("link", { name: "Privatliv" }).click();
  await expect(page).toHaveURL(/\/privatliv$/);
  await expect(page.getByRole("heading", { name: "Privatliv", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dine rettigheder" })).toBeVisible();
});
