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
  // Who liked it is shown as a face, not written out as a name; pressing the face names them.
  const likers = page.getByRole("button", { name: "Bo synes godt om opslaget" });
  await expect(likers).toBeVisible();
  await expect(likers).toHaveText("B");
  await likers.click();
  const liked = page.getByRole("dialog", { name: "Synes godt om" });
  await expect(liked.getByRole("listitem")).toHaveText([/Bo$/]);
  await expect(liked.getByRole("link", { name: /Bo$/ })).toHaveAttribute("href", `/spiller/${bo.id}`);
  await page.keyboard.press("Escape");
  await expect(liked).toBeHidden();
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
  // Nobody is named before the viewer has voted: the count is words, not a button.
  await expect(page.getByRole("button", { name: /har stemt/ })).toHaveCount(0);
  // One answer allowed: pressing it is the vote, and there is no "Stem" to press.
  await expect(page.getByRole("button", { name: "Stem", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Lørdag" }).click();
  await expect(page.getByText("1 har stemt")).toBeVisible();
  // The result's bars grow in.
  await expect(page.locator(".animate-bar-grow")).toHaveCount(2);
  await expect(page.locator(".animate-bar-grow").first()).toHaveCSS("animation-name", "bar-grow");
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
  await expect(page.getByRole("button", { name: "Frederik" }).locator("xpath=ancestor::ul[1]")).toHaveClass(/grid-cols-2/);
  // The post's text sits above the poll.
  const bodyBox = await page.getByText("Kampens spiller").boundingBox();
  const questionBox = await page.getByText("Hvem var bedst?").boundingBox();
  expect(bodyBox!.y).toBeLessThan(questionBox!.y);
  // Bo has not voted and did not write the post: the menu offers pinning and nothing else.
  await page.getByRole("button", { name: "Handlinger" }).click();
  await expect(page.getByRole("dialog").getByRole("list").getByRole("button")).toHaveText([/Fastgør øverst/]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Pressed the moment the page opens: with the feed behind a <Suspense> this left the
  // button pending for good now and then (see tests/unit/no-suspense.test.ts).
  await page.getByRole("button", { name: "Victor" }).click();
  await expect(page.getByText("2 har stemt")).toBeVisible();
  // Emil and Victor have a vote each and lead, in the order they were written; the rest follow.
  await expect(page.locator("li").filter({ hasText: /· \d+%$/ })).toHaveText([/^Emil/, /^Victor.*din stemme/, /^Frederik/, /^Oliver/, /^Lucas/]);
  await page.getByRole("button", { name: "Vis alle 6 svar" }).click();
  await expect(page.getByText(/^Mads/)).toBeVisible();

  await page.getByRole("button", { name: "Handlinger" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("button", { name: "Luk afstemning" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Slet opslag" })).toHaveCount(0);
  // Who voted for what is no longer an action in the menu: it opens from "2 har stemt".
  await expect(menu.getByRole("button", { name: "Se stemmer" })).toHaveCount(0);
  await expect(menu.getByRole("list").getByRole("button")).toHaveText([/Fastgør øverst/, /Skift stemme/]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "2 har stemt" }).click();
  const votes = page.getByRole("dialog", { name: "Stemmer" });
  await expect(votes.getByRole("link")).toHaveText([/Træner Tom/, /Bo/]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Skift stemme" }).click();
  // The answer chosen last time is marked; pressing another moves the vote at once.
  await expect(page.getByRole("button", { name: "Victor" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Oliver" }).click();
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

test("a poll with several answers is ticked and sent with Stem", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await db.post.create({
    data: {
      teamId: team.id,
      authorId: anna.id,
      poll: {
        create: {
          teamId: team.id,
          question: "Hvilke dage kan du?",
          multipleChoice: true,
          options: { create: ["Mandag", "Onsdag", "Fredag"].map((text, position) => ({ text, position })) },
        },
      },
    },
  });
  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("checkbox", { name: "Mandag" }).check();
  await page.getByRole("checkbox", { name: "Fredag" }).check();
  // Ticking is not voting.
  await expect(page.getByText("0 har stemt")).toBeVisible();
  expect(await db.pollVote.count()).toBe(0);
  await page.getByRole("button", { name: "Stem", exact: true }).click();
  await expect(page.getByText("1 har stemt")).toBeVisible();
  expect((await db.pollVote.findMany({ include: { option: true }, orderBy: { option: { position: "asc" } } })).map((v) => v.option.text)).toEqual(["Mandag", "Fredag"]);
});

test("an anonymous poll never names who voted", async ({ page, loginAs }) => {
  const { team, admin, anna, bo } = await squad();
  const post = await db.post.create({
    data: {
      teamId: team.id,
      authorId: anna.id,
      poll: {
        create: {
          teamId: team.id,
          question: "Skal vi skifte træner?",
          anonymous: true,
          options: { create: ["Ja", "Nej"].map((text, position) => ({ text, position })) },
        },
      },
    },
    include: { poll: { include: { options: { orderBy: { position: "asc" } } } } },
  });
  const poll = post.poll!;
  await db.pollVote.create({ data: { pollId: poll.id, optionId: poll.options[0]!.id } });
  await db.pollBallot.create({ data: { pollId: poll.id, userId: admin.id } });

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Nej" }).click();
  // The result is shown, but the count stays words: there is nobody to list.
  await expect(page.getByText("2 har stemt · du har stemt")).toBeVisible();
  await expect(page.getByRole("button", { name: /har stemt/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Handlinger" }).click();
  await expect(page.getByRole("dialog").getByRole("list").getByRole("button")).toHaveText([/Fastgør øverst/]);
});

test("the author edits a post's words, an admin edits anybody's, and a teammate cannot", async ({ page, loginAs }) => {
  const { team, admin, anna, bo } = await squad();
  const post = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Træning kl. 18" } });

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Handlinger" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Fastgør øverst" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Rediger opslag" })).toHaveCount(0);

  await loginAs(anna);
  await page.goto("/oversigt");
  await expect(page.getByText("redigeret")).toHaveCount(0);
  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Rediger opslag" }).click();
  const edit = page.getByRole("dialog", { name: "Rediger opslag" });
  await expect(edit.getByLabel("Tekst")).toHaveValue("Træning kl. 18");
  // Emptied, it is refused and what was typed stays.
  await edit.getByLabel("Tekst").fill(" ");
  await edit.getByRole("button", { name: "Gem" }).click();
  await expect(edit.getByRole("alert")).toHaveText("Et opslag skal have tekst eller billeder.");
  await edit.getByLabel("Tekst").fill("Træning kl. 19 — ny tid!");
  await edit.getByRole("button", { name: "Gem" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("Træning kl. 19 — ny tid!")).toBeVisible();
  await expect(page.getByText("· redigeret")).toBeVisible();

  await loginAs(admin);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Rediger opslag" }).click();
  await page.getByRole("dialog", { name: "Rediger opslag" }).getByLabel("Tekst").fill("Træning aflyst");
  await page.getByRole("dialog", { name: "Rediger opslag" }).getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Træning aflyst")).toBeVisible();
  expect(await db.post.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ body: "Træning aflyst", authorId: anna.id });
});

test("anybody pins a post to the top of the feed and lets it go again", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const old = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Husk kontingent", createdAt: new Date(Date.now() - 86_400_000) } });
  await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Nyeste opslag" } });

  await loginAs(bo);
  await page.goto("/oversigt");
  const bodies = page.locator("#feed p.whitespace-pre-line");
  await expect(bodies).toHaveText(["Nyeste opslag", "Husk kontingent"]);
  await expect(page.getByText("Fastgjort")).toHaveCount(0);

  await page.getByRole("button", { name: "Handlinger" }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fastgør øverst" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(bodies).toHaveText(["Husk kontingent", "Nyeste opslag"]);
  await expect(page.getByText("Fastgjort")).toHaveCount(1);
  expect((await db.post.findUniqueOrThrow({ where: { id: old.id } })).pinnedAt).not.toBeNull();

  // Another teammate sees it on top, and may let it go.
  await loginAs(anna);
  await page.goto("/oversigt");
  await expect(bodies).toHaveText(["Husk kontingent", "Nyeste opslag"]);
  await page.getByRole("button", { name: "Handlinger" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Frigør fra toppen" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(bodies).toHaveText(["Nyeste opslag", "Husk kontingent"]);
  await expect(page.getByText("Fastgjort")).toHaveCount(0);
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

test("the chat box grows with its lines, stops at its cap and shrinks back when sent", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/chat");
  const box = page.getByRole("textbox", { name: "Besked" });
  const height = () => box.evaluate((el) => el.getBoundingClientRect().height);
  const oneLine = await height();

  await box.fill("Første linje\nAnden linje\nTredje linje");
  await expect.poll(height).toBeGreaterThan(oneLine + 20);
  // Nothing is hidden: the box shows every line without scrolling.
  expect(await box.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);

  // A very long message stops at the cap (max-h-32) and scrolls inside the box.
  await box.fill(Array.from({ length: 30 }, (_, i) => `Linje ${i + 1}`).join("\n"));
  await expect.poll(height).toBe(128);

  await box.fill("Kort");
  await expect.poll(height).toBe(oneLine);

  await box.fill("En\nTo\nTre");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(box).toHaveValue("");
  await expect.poll(height).toBe(oneLine);
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

test("the chat's message box goes down with the tab bar, leaving no empty strip under it", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await db.chatMessage.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      teamId: team.id,
      authorId: i % 2 ? anna.id : bo.id,
      body: `Besked ${i + 1}`,
      createdAt: new Date(Date.now() - (30 - i) * 60_000),
    })),
  });
  await loginAs(anna);
  await page.goto("/chat");
  // Exact: "Besked 3" followed by a time stamp starting with 0 also reads "Besked 30…".
  await expect(page.getByText("Besked 30", { exact: true })).toBeVisible();
  // The tab bar's highlight is placed once the page has hydrated and is listening to the scroll.
  await expect(page.getByTestId("tab-pill")).toBeAttached();
  const box = page.locator("form").filter({ has: page.getByRole("textbox", { name: "Besked" }) });
  const { height } = page.viewportSize()!;
  const gapBelow = async () => {
    const b = (await box.boundingBox())!;
    return Math.round(height - (b.y + b.height));
  };

  // Back up the conversation, then down again towards the newest: the bar goes on the
  // way down, and the box sits at the foot of the screen.
  const frame = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.evaluate(() => window.scrollBy(0, -900));
  await frame();
  await page.evaluate(() => window.scrollBy(0, 300));
  await expect(page.locator("html")).toHaveAttribute("data-bars", "hidden");
  await expect.poll(gapBelow).toBeLessThan(30);

  // At the newest message again: the bar is back, and the box sits just above it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("html")).not.toHaveAttribute("data-bars");
  await expect.poll(gapBelow).toBeGreaterThan(60);
  await expect(page.getByRole("link", { name: "Chat" })).toBeInViewport({ ratio: 1 });
});

test("leaving the chat keeps the app running", async ({ page, loginAs }) => {
  // Chrome's scrollIntoView now returns a Promise; an effect that handed it back to React
  // was called as its clean-up on the way out, and the whole app fell over. React reports
  // that on the console, and the error screen reloads the page once by itself — so the
  // test listens to the console and checks the page was never reloaded.
  const { anna } = await squad();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|_vercel\/insights/.test(message.text())) errors.push(message.text());
  });
  await loginAs(anna);
  await page.goto("/chat");
  await expect(page.getByRole("textbox", { name: "Besked" })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { stillTheSamePage: true }));
  await page.getByRole("navigation").getByRole("link", { name: "Aktiviteter" }).click();
  await expect(page.getByRole("heading", { name: "Aktiviteter", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => "stillTheSamePage" in window)).toBe(true);
  expect(errors).toEqual([]);
});
