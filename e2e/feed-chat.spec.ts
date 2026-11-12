import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("a post with words shows in the feed, and a teammate likes and comments", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Nyt opslag" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tekst").fill("Sikke en sejr i dag!");
  await dialog.getByRole("button", { name: "Del" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Sikke en sejr i dag!")).toBeVisible();

  await loginAs(bo);
  await page.goto("/oversigt");
  await expect(page.getByText("Sikke en sejr i dag!")).toBeVisible();
  await page.getByRole("button", { name: /Synes godt om|Like|👍|❤/ }).first().click();
  await expect.poll(() => db.postLike.count()).toBe(1);
  await page.getByPlaceholder(/kommentar/i).fill("Flot spillet!");
  await page.getByPlaceholder(/kommentar/i).press("Enter");
  await expect(page.getByText("Flot spillet!")).toBeVisible();
});

test("a poll hides its result until you have voted", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Nyt opslag" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tilføj afstemning" }).click();
  await dialog.getByLabel("Spørgsmål").fill("Hvornår er der julefrokost?");
  await dialog.getByRole("textbox", { name: "Svar 1" }).fill("Fredag");
  await dialog.getByRole("textbox", { name: "Svar 2" }).fill("Lørdag");
  await dialog.getByRole("button", { name: "Del" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Hvornår er der julefrokost?")).toBeVisible();

  await loginAs(bo);
  await page.goto("/oversigt");
  await expect(page.getByText("0 har stemt")).toBeVisible();
  await page.getByRole("radio", { name: "Lørdag" }).check();
  await page.getByRole("button", { name: "Stem", exact: true }).click();
  await expect(page.getByText("1 har stemt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skift stemme" })).toBeVisible();
  expect(await db.pollVote.findFirst({ include: { option: true } })).toMatchObject({ voterId: bo.id, option: { text: "Lørdag" } });
});

test("a poll's answers are ticked on the roster, with several answers allowed and anonymous", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await expect(page.getByRole("button", { name: "Afstemning", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Nyt opslag" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tilføj afstemning" }).click();
  await dialog.getByLabel("Spørgsmål").fill("Hvem tager kage med?");
  await dialog.getByRole("button", { name: "Vælg fra holdlisten" }).click();
  const roster = dialog.getByRole("group", { name: "Svarmuligheder" }).getByRole("checkbox");
  await expect(roster).toHaveCount(await db.teamMember.count({ where: { teamId: team.id } }));
  await expect(roster.first()).toBeChecked();
  await dialog.getByRole("checkbox", { name: /Træner Tom/ }).uncheck();
  await dialog.getByRole("checkbox", { name: /Kasserer Kim/ }).uncheck();
  await dialog.getByLabel(/Flere svar/).check();
  await dialog.getByLabel(/Anonym/).check();
  await dialog.getByRole("button", { name: "Del" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Hvem tager kage med?")).toBeVisible();

  const poll = await db.poll.findFirstOrThrow({ include: { options: { orderBy: { position: "asc" } } } });
  expect(poll).toMatchObject({ anonymous: true, multipleChoice: true, matchId: null });
  expect(poll.options.map((o) => o.playerId)).toEqual([anna.id, bo.id]);
});

test("the chat sends a message that a teammate sees", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Besked" }).fill("Husk træning kl. 18!");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Husk træning kl. 18!")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Besked" })).toHaveValue("");

  await loginAs(bo);
  await page.goto("/chat");
  await expect(page.getByText("Husk træning kl. 18!")).toBeVisible();
  expect(await db.chatMessage.count({ where: { authorId: anna.id } })).toBe(1);
});
