import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("a player's page shows their fines, challenges and jobs, and no way to edit somebody else", async ({ page, loginAs }) => {
  const { team, treasurer, anna, bo } = await squad();
  const other = await squad("Naboerne");
  const match = await db.match.create({ data: { teamId: team.id, title: "Kamp", opponent: "FC Naboen", startsAt: new Date(Date.now() + 3 * 86_400_000) } });
  await db.fine.create({ data: { teamId: team.id, playerId: bo.id, reason: "Glemt trøje", units: 2, unitPriceKr: 10, issuedById: treasurer.id } });
  await db.challenge.create({
    data: { teamId: team.id, winnerId: anna.id, loserId: bo.id, reportedById: anna.id, description: "Flest straffe", units: 1 },
  });
  await db.task.create({ data: { teamId: team.id, matchId: match.id, title: "Vaske trøjer", assignees: { create: { userId: bo.id } } } });
  // Somebody else's job, and another team's, stay off Bo's page.
  await db.task.create({ data: { teamId: team.id, matchId: match.id, title: "Kridte banen", assignees: { create: { userId: anna.id } } } });
  await db.fine.create({ data: { teamId: other.team.id, playerId: other.bo.id, reason: "Naboens bøde", units: 1, unitPriceKr: 10, issuedById: other.treasurer.id } });

  await loginAs(anna);
  await page.goto(`/spiller/${bo.id}`);
  await expect(page.getByRole("heading", { name: "Bo", level: 1 })).toBeVisible();
  await expect(page.getByText("Glemt trøje")).toBeVisible();
  await expect(page.getByText("“Flest straffe”")).toBeVisible();
  await expect(page.getByText("Vaske trøjer")).toBeVisible();
  await expect(page.getByText("Kridte banen")).toHaveCount(0);
  await expect(page.getByText("Naboens bøde")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Rediger" })).toHaveCount(0);

  // From the challenge, a name leads on to that player's page.
  await page.getByRole("link", { name: /^Anna/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
  await expect(page.getByRole("heading", { name: "Anna", level: 1 })).toBeVisible();
  await expect(page.getByText("Kridte banen")).toBeVisible();
});

test("your own page is your profile: the header's picture opens it, and Rediger leads to the settings", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("link", { name: "Min profil" }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
  await expect(page.getByRole("heading", { name: "Anna", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Rediger" }).click();
  await expect(page).toHaveURL(/\/profil$/);
  await expect(page.getByLabel("Navn")).toHaveValue("Anna");
  await page.getByRole("link", { name: "Se min side" }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
});

test("names in the feed, the comments and the chat open the person's page", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const post = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr 3-1!" } });
  await db.postComment.create({ data: { postId: post.id, authorId: bo.id, body: "Det mål i 89. minut" } });
  await db.chatMessage.create({ data: { teamId: team.id, authorId: anna.id, body: "Hej holdet" } });

  await loginAs(bo);
  await page.goto("/oversigt#feed");
  await page.getByRole("button", { name: "1 kommentar" }).click();
  const drawer = page.getByRole("dialog", { name: "Kommentarer" });
  await drawer.getByRole("link", { name: "Bo" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}$`));
  await expect(drawer).toBeHidden();

  await page.goto("/oversigt#feed");
  await page.getByRole("link", { name: "Anna", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));

  await page.goto("/chat");
  await page.getByRole("link", { name: "Anna" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
});

test("the roster opens each player's page", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/hold/spillere");
  await page.getByRole("link", { name: /^Bo/ }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}$`));
});

test("an old link to a player's fines lands on their page", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto(`/boder/spiller/${bo.id}`);
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}$`));
  await expect(page.getByRole("heading", { name: "Bo", level: 1 })).toBeVisible();
});
