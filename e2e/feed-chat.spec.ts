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
  await page.getByRole("button", { name: "0 kommentarer" }).click();
  const comments = page.getByRole("dialog", { name: "Kommentarer" });
  await expect(comments.getByText("Ingen kommentarer endnu")).toBeVisible();
  await comments.getByPlaceholder(/kommentar/i).fill("Flot spillet!");
  await comments.getByPlaceholder(/kommentar/i).press("Enter");
  // The drawer stays open, the comment appears in it and the box is ready for the next.
  await expect(comments.getByText("Flot spillet!")).toBeVisible();
  await expect(comments.getByPlaceholder(/kommentar/i)).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "1 kommentar", exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Handlinger" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Skift stemme" })).toBeVisible();
  expect(await db.pollVote.findFirst({ include: { option: true } })).toMatchObject({ voterId: bo.id, option: { text: "Lørdag" } });
});

test("a poll's many answers sit in two columns, its result leads with the most votes, and the ⋯ menu holds what can be done", async ({
  page,
  loginAs,
}) => {
  const { team, admin, anna, bo } = await squad();
  const names = ["Frederik", "Oliver", "Emil", "Lucas", "Mads", "Victor"];
  const post = await db.post.create({
    data: {
      teamId: team.id,
      authorId: anna.id,
      body: "Kampens spiller",
      poll: {
        create: {
          teamId: team.id,
          question: "Hvem var bedst?",
          options: { create: names.map((text, position) => ({ text, position })) },
        },
      },
    },
    include: { poll: { include: { options: { orderBy: { position: "asc" } } } } },
  });
  page.on("request", (r) => { if (r.method() === "POST") console.log("REQ", r.url(), r.headers()["next-action"]?.slice(0,8), (r.postData() ?? "").slice(0, 30).replace(/\s+/g," ")); });
  page.on("requestfinished", (r) => { if (r.method() === "POST") console.log("FIN", r.url()); });
  page.on("requestfailed", (r) => console.log("FAILED", r.url(), r.failure()?.errorText));
  page.on("pageerror", (e) => console.log("PAGEERR", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0,200)); });
  const poll = post.poll!;
  const emil = poll.options[2]!;
  await db.pollVote.create({ data: { pollId: poll.id, optionId: emil.id, voterId: admin.id } });
  await db.pollBallot.create({ data: { pollId: poll.id, userId: admin.id } });

  await loginAs(bo);
  await page.goto("/oversigt");
  await expect(page.getByRole("radio", { name: "Frederik" }).locator("xpath=ancestor::ul[1]")).toHaveClass(/grid-cols-2/);
  // Bo has not voted, so the menu offers nothing about the poll — and Bo did not write the post.
  await expect(page.getByRole("button", { name: "Handlinger" })).toHaveCount(0);

  // Pressed the moment the page opens: with the feed streamed in behind a <Suspense>
  // this left the button pending for good now and then (see `TeamFeed`).
  await page.getByRole("radio", { name: "Victor" }).check();
  await page.getByRole("button", { name: "Stem", exact: true }).click();
  await expect(page.getByText("2 har stemt")).toBeVisible();
  // Emil and Victor have a vote each and lead, in the order they were written; the rest follow.
  await expect(page.locator("li").filter({ hasText: /· \d+%$/ })).toHaveText([/^Emil/, /^Victor.*din stemme/, /^Frederik/, /^Oliver/, /^Lucas/]);
  await page.getByRole("button", { name: "Vis alle 6 svar" }).click();
  await expect(page.getByText(/^Mads/)).toBeVisible();

  await page.getByRole("button", { name: "Handlinger" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("button", { name: "Luk afstemning" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Slet opslag" })).toHaveCount(0);
  await menu.getByRole("button", { name: "Se stemmer" }).click();
  await expect(page.getByRole("dialog", { name: "Stemmer" })).toContainText("Træner Tom");
  await expect(page.getByRole("dialog", { name: "Stemmer" })).toContainText("Bo");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Skift stemme" }).click();
  await page.getByRole("radio", { name: "Oliver" }).check();
  await page.getByRole("button", { name: "Stem", exact: true }).click();
  await expect.poll(async () => (await db.pollVote.findFirst({ where: { voterId: bo.id }, include: { option: true } }))?.option.text).toBe("Oliver");

  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Luk afstemning" }).click();
  await page.getByRole("dialog", { name: "Luk afstemningen?" }).getByRole("button", { name: "Luk den" }).click();
  await expect.poll(async () => (await db.poll.findUniqueOrThrow({ where: { id: poll.id } })).closedAt).not.toBeNull();
  await expect(page.getByText("Lukket")).toBeVisible();

  await page.getByRole("button", { name: "Handlinger" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Luk afstemning" })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Slet opslag" }).click();
  await page.getByRole("dialog", { name: "Slet opslaget?" }).getByRole("button", { name: "Slet" }).click();
  await expect(page.getByText("Hvem var bedst?")).toBeHidden();
  expect(await db.post.count()).toBe(0);
});

test("comments open in a drawer, each apart with its writer, and only its writer can delete it", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const post = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr 3-1!" } });
  await db.postComment.create({ data: { postId: post.id, authorId: anna.id, body: "Hvilken kamp" } });
  await db.postComment.create({ data: { postId: post.id, authorId: bo.id, body: "Det mål i 89. minut" } });

  await loginAs(bo);
  await page.goto("/oversigt");
  // On the card only the count; the words are in the drawer.
  await expect(page.getByText("Det mål i 89. minut")).toHaveCount(0);
  await page.getByRole("button", { name: "2 kommentarer" }).click();
  const comments = page.getByRole("dialog", { name: "Kommentarer" }).getByRole("list", { name: "Kommentarer" }).getByRole("listitem");
  await expect(comments).toHaveCount(2);
  await expect(comments.nth(0)).toContainText("Anna");
  await expect(comments.nth(0).getByRole("button", { name: "Slet" })).toHaveCount(0);
  await comments.nth(1).getByRole("button", { name: "Slet" }).click();
  await expect(comments).toHaveCount(1);
  expect(await db.postComment.count()).toBe(1);
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
