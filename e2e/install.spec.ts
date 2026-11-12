import { test, expect } from "./helpers/fixtures";
import { squad } from "./helpers/database";

test("/hent-appen greets a signed-in player by first name and lets them go on to the team", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/hent-appen");
  await expect(page.getByRole("heading", { name: "Velkommen, Anna!" })).toBeVisible();
  await expect(page.getByText("Hent Swingkings på din telefon")).toBeVisible();
  await page.getByRole("link", { name: "Fortsæt til holdet, Anna →" }).click();
  await expect(page).toHaveURL(/\/oversigt$/);
});

test("/hent-appen sends somebody signed out to the login page", async ({ page }) => {
  await page.goto("/hent-appen");
  await expect(page).toHaveURL(/\/login$/);
});
