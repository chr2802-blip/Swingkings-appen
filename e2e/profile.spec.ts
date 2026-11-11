import { test, expect } from "./helpers/fixtures";
import { PASSWORD, db, squad } from "./helpers/database";

test("renames yourself", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/profil");
  await page.getByLabel("Navn").fill("Anna Andersen");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: anna.id } })).name).toBe("Anna Andersen");
});

test("changes the password, which then works at the login form", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/profil");
  await page.getByLabel("Nuværende adgangskode").fill(PASSWORD);
  await page.getByLabel("Ny adgangskode").fill("et-helt-nyt-kodeord");
  await page.getByRole("button", { name: "Skift adgangskode" }).click();
  await expect(page.getByText("Adgangskoden er skiftet. Du er logget ud alle andre steder.")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(anna.email);
  await page.getByLabel("Adgangskode").fill("et-helt-nyt-kodeord");
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/(hent-appen|oversigt)$/);
});
