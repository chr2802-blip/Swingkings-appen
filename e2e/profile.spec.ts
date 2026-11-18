import { test, expect } from "./helpers/fixtures";
import { PASSWORD, db, squad } from "./helpers/database";
import { demoPicture } from "../src/lib/demo-pictures";

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

test("the profile picture is round; with none it is chosen at once, with one it is changed or removed from a drawer", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/profil");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Vælg profilbillede" }).click();
  await (await chooser).setFiles({ name: "mig.png", mimeType: "image/png", buffer: Buffer.from(demoPicture(0).full) });
  const photo = page.getByRole("button", { name: "Skift eller fjern profilbillede" });
  await expect(photo).toBeVisible();
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: anna.id } })).photoId).not.toBeNull();

  await photo.click();
  const drawer = page.getByRole("dialog", { name: "Profilbillede" });
  await expect(drawer.getByRole("button", { name: "Skift billede" })).toBeVisible();
  await drawer.getByRole("button", { name: "Fjern billede" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Vælg profilbillede" })).toBeVisible();
  await page.getByRole("button", { name: "Gem" }).click();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: anna.id } })).photoId).toBeNull();
});
