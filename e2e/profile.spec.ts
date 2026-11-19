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

test("sets your own shirt number, which your card then wears", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/profil");
  await expect(page.getByText("Dit nummer på Swingkings.")).toBeVisible();
  await page.getByLabel("Trøjenummer").fill("10");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  expect((await db.teamMember.findFirstOrThrow({ where: { userId: anna.id } })).shirtNumber).toBe(10);

  await page.getByRole("link", { name: "Se min side" }).click();
  await expect(page.getByText("#10", { exact: true })).toBeVisible();
  await expect(page.locator('main [data-shirt="10"]').first()).toBeVisible();

  // Your place on the board leads to the board.
  await page.getByRole("link", { name: "Nummer 1 på bødetavlen" }).click();
  await expect(page).toHaveURL(/\/boder$/);
  await expect(page.getByRole("tab", { name: "Bødetavlen" })).toHaveAttribute("aria-selected", "true");

  // A number past 999 the browser refuses to send, and the old one stands.
  await page.goto("/profil");
  const field = page.getByLabel("Trøjenummer");
  await field.fill("1000");
  await page.getByRole("button", { name: "Gem" }).click();
  expect(await field.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
  expect((await db.teamMember.findFirstOrThrow({ where: { userId: anna.id } })).shirtNumber).toBe(10);
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
