import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";
import { hold, holdAndChoose } from "./helpers/hold";
import { openChoices } from "./helpers/select";

test("a post with words shows in the feed, and a teammate reacts and comments", async ({ page, loginAs }) => {
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
  // A press gives the crest's crown; the reactions in short show above the bar.
  await page.getByRole("button", { name: "Giv en krone 👑" }).click();
  await expect(page.getByRole("button", { name: "1 reaktion: Bo har reageret" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fjern din reaktion (Krone 👑)" })).toHaveAttribute("aria-pressed", "true");
  // As on Facebook: how many reacted stands beside the button's own reaction.
  await expect(page.getByRole("button", { name: "Fjern din reaktion (Krone 👑)" })).toHaveText("1");
  await expect.poll(() => db.reaction.count({ where: { kind: "CROWN", userId: bo.id } })).toBe(1);
  // Held, it brings up the rest; the one chosen takes the crown's place — one reaction each.
  await hold(page, page.getByRole("button", { name: "Fjern din reaktion (Krone 👑)" }));
  await page.getByRole("group", { name: "Vælg en reaktion" }).getByRole("button", { name: "Elsker ❤️" }).click();
  await expect(page.getByRole("group", { name: "Vælg en reaktion" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Fjern din reaktion (Elsker ❤️)" })).toBeVisible();
  await expect.poll(() => db.reaction.findMany({ where: { userId: bo.id }, select: { kind: true } })).toEqual([{ kind: "HEART" }]);
  // The summary opens who reacted, in tabs: everybody, then each kind given.
  await page.reload();
  await page.getByRole("button", { name: "1 reaktion: Bo har reageret" }).click();
  const reacted = page.getByRole("dialog", { name: "Reaktioner" });
  await expect(reacted.getByRole("tab", { name: "Alle 1" })).toHaveAttribute("aria-selected", "true");
  await expect(reacted.getByRole("tab", { name: "Elsker 1" })).toBeVisible();
  await expect(reacted.getByRole("listitem")).toHaveText([/Bo\s*Elsker$/]);
  await expect(reacted.getByRole("link", { name: /Bo/ })).toHaveAttribute("href", `/spiller/${bo.id}`);
  await reacted.getByRole("tab", { name: "Elsker 1" }).click();
  await expect(reacted.getByRole("tab", { name: "Elsker 1" })).toHaveAttribute("aria-selected", "true");
  await expect(reacted.getByRole("listitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(reacted).toBeHidden();
  // A press on the button now takes the reaction back.
  await page.getByRole("button", { name: "Fjern din reaktion (Elsker ❤️)" }).click();
  await expect(page.getByRole("button", { name: /reaktion: / })).toHaveCount(0);
  // Nobody has reacted: the crown alone, and no number.
  await expect(page.getByRole("button", { name: "Giv en krone 👑" })).toHaveText("");
  await expect.poll(() => db.reaction.count()).toBe(0);
  await page.getByRole("button", { name: "0 kommentarer" }).click();
  const comments = page.getByRole("dialog", { name: "Kommentarer" });
  await expect(comments.getByText("Ingen kommentarer endnu")).toBeVisible();
  await comments.getByPlaceholder(/kommentar/i).fill("Flot spillet!");
  // Enter makes a new line; "Send" sends.
  await comments.getByPlaceholder(/kommentar/i).press("Enter");
  await expect(comments.getByPlaceholder(/kommentar/i)).toHaveValue("Flot spillet!\n");
  await comments.getByRole("button", { name: "Send" }).click();
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
  // Nobody has voted yet, so there is nobody to list: the count is words, not a button.
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
  // Before voting in the open poll, "1 har stemt" says who has voted — and not for whom.
  await page.getByRole("button", { name: "1 har stemt" }).click();
  const hasVoted = page.getByRole("dialog", { name: "Har stemt" });
  await expect(hasVoted.getByRole("listitem")).toHaveText([/Træner Tom/]);
  await expect(hasVoted).not.toContainText("Emil");
  await page.keyboard.press("Escape");
  await expect(hasVoted).toBeHidden();

  // Pressed the moment the page opens: with the feed behind a <Suspense> this left the
  // button pending for good now and then (see tests/unit/no-suspense.test.ts).
  await page.getByRole("button", { name: "Victor" }).click();
  await expect(page.getByText("2 har stemt")).toBeVisible();
  // Emil and Victor have a vote each and lead, in the order they were written; the rest follow.
  await expect(page.locator("li").filter({ hasText: /· \d+%$/ })).toHaveText([/^Emil/, /^Victor.*din stemme/, /^Frederik/, /^Oliver/, /^Lucas/]);
  // "2 har stemt" sits to the right of "Vis alle", on the same row.
  const showAll = (await page.getByRole("button", { name: "Vis alle 6 svar" }).boundingBox())!;
  const count = (await page.getByRole("button", { name: "2 har stemt" }).boundingBox())!;
  expect(count.x).toBeGreaterThan(showAll.x + showAll.width);
  expect(Math.abs(count.y + count.height / 2 - (showAll.y + showAll.height / 2))).toBeLessThan(2);
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

test("a poll made with its result hidden shows nothing until its maker shows the result", async ({ page, loginAs }) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Nyt opslag" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tilføj afstemning" }).click();
  await dialog.getByLabel("Spørgsmål").fill("Hvem er årets spiller?");
  await dialog.getByRole("textbox", { name: "Svar 1" }).fill("Anna");
  await dialog.getByRole("textbox", { name: "Svar 2" }).fill("Bo");
  await dialog.getByLabel(/Anonym/).check();
  await dialog.getByLabel(/Skjul resultatet/).check();
  await dialog.getByRole("button", { name: "Del" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Skjult resultat")).toBeVisible();

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Bo", exact: true }).click();
  await expect(page.getByText("1 har stemt · du har stemt")).toBeVisible();
  // Voted, but no count and no bars: only the answers, and that it is hidden. Anonymous,
  // so not even his own choice is marked — the vote carries no voter.
  await expect(page.getByText("Resultatet er skjult, til det bliver offentliggjort.")).toBeVisible();
  await expect(page.getByText("(din stemme)")).toHaveCount(0);
  await expect(page.locator(".animate-bar-grow")).toHaveCount(0);
  await page.getByRole("button", { name: "Handlinger" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Offentliggør resultat" })).toHaveCount(0);

  await loginAs(anna);
  await page.goto("/oversigt");
  // She has not voted, so she is offered the answers to pick — and no count.
  await expect(page.getByText("Skjult resultat")).toBeVisible();
  await expect(page.getByRole("button", { name: "Anna", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Handlinger" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Offentliggør resultat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Offentliggør", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(async () => (await db.poll.findFirstOrThrow()).resultsShownAt).not.toBeNull();

  await loginAs(bo);
  await page.goto("/oversigt");
  await expect(page.getByText("Skjult resultat")).toHaveCount(0);
  await expect(page.locator(".animate-bar-grow")).toHaveCount(2);
  await expect(page.getByText("1 · 100%")).toBeVisible();
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
  // Nothing to press on a comment until it is held; then Bo may delete his own, not Anna's.
  await expect(comments.getByRole("button", { name: /^(Svar|Slet)$/ })).toHaveCount(0);
  await hold(page, comments.nth(0).getByText("Hvilken kamp"));
  await expect(page.getByRole("group", { name: "Handlinger" }).getByRole("button", { name: "Slet" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await holdAndChoose(page, comments.nth(1).getByText("Det mål i 89. minut"), "Slet");
  await expect(comments).toHaveCount(1);
  expect(await db.postComment.count()).toBe(1);
});

test("typing @ in a comment offers teammates, and the tagged name links to their page", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr 3-1!" } });

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "0 kommentarer" }).click();
  const drawer = page.getByRole("dialog", { name: "Kommentarer" });
  const box = drawer.getByRole("textbox", { name: "Kommentar", exact: true });
  await box.fill("Godt spillet @an");
  const offered = drawer.getByRole("listbox", { name: "Tag en holdkammerat" }).getByRole("option");
  // Only names that begin with what was typed, and never yourself.
  await expect(offered).toHaveCount(1);
  await expect(offered).toHaveAccessibleName("Anna");
  await offered.first().click();
  await expect(box).toHaveValue("Godt spillet @Anna ");
  await expect(drawer.getByRole("listbox")).toHaveCount(0);
  await box.pressSequentially("og @Bo");
  await expect(drawer.getByRole("listbox")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Send" }).click();

  const comment = drawer.getByRole("list", { name: "Kommentarer" }).getByRole("listitem");
  await expect(comment).toContainText("Godt spillet @Anna og @Bo");
  await expect(comment.getByRole("link", { name: "@Anna" })).toHaveAttribute("href", `/spiller/${anna.id}`);
  await expect(comment.getByRole("link", { name: "@Bo" })).toHaveAttribute("href", `/spiller/${bo.id}`);
  await expect(box).toHaveValue("");
});

test("a comment is answered from the drawer, and the answer sits under it", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const post = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr 3-1!" } });
  const first = await db.postComment.create({ data: { postId: post.id, authorId: anna.id, body: "Hvilken kamp" } });

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "1 kommentar", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Kommentarer" });
  // Holding the comment and choosing "Svar" readies the box, with its writer tagged first.
  await holdAndChoose(page, drawer.getByText("Hvilken kamp"), "Svar");
  await expect(drawer.getByText("Svarer Anna")).toBeVisible();
  const box = drawer.getByRole("textbox", { name: "Svar", exact: true });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("@Anna ");
  await box.pressSequentially("Det var den bedste i år");
  await drawer.getByRole("button", { name: "Send" }).click();

  const answers = drawer.getByRole("list", { name: "Svar til Anna" }).getByRole("listitem");
  await expect(answers).toHaveCount(1);
  await expect(answers.nth(0)).toContainText("@Anna Det var den bedste i år");
  await expect(answers.nth(0).getByRole("link", { name: "@Anna" })).toHaveAttribute("href", `/spiller/${anna.id}`);
  // After sending, the box writes a plain comment again.
  await expect(drawer.getByRole("textbox", { name: "Kommentar", exact: true })).toHaveValue("");
  await expect(drawer.getByText("Svarer Anna")).toHaveCount(0);
  expect((await db.postComment.findFirstOrThrow({ where: { authorId: bo.id } })).parentId).toBe(first.id);

  // "Annuller" turns an answer back into a comment on the post, and the tag goes with it.
  await holdAndChoose(page, drawer.getByText("Hvilken kamp"), "Svar");
  await drawer.getByRole("button", { name: "Annuller" }).click();
  await expect(drawer.getByRole("textbox", { name: "Kommentar", exact: true })).toHaveValue("");

  // No row of emojis over the box.
  await expect(drawer.getByRole("group", { name: "Indsæt emoji" })).toHaveCount(0);
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
  // The roster is the app's own drop-down, with the whole team ticked to start with.
  const players = dialog.getByRole("group", { name: "Svarmuligheder" }).getByLabel("Spillere");
  // A fieldset shrinks like any block, so the field truncates the whole team's names rather than
  // widening the sheet past the phone's edge.
  const group = dialog.getByRole("group", { name: "Svarmuligheder" });
  expect(await group.evaluate((el) => getComputedStyle(el).minInlineSize)).toBe("0px");
  const list = await openChoices(players);
  const roster = list.getByRole("option");
  await expect(roster).toHaveCount(await db.teamMember.count({ where: { teamId: team.id } }));
  await expect(roster.first()).toHaveAttribute("aria-selected", "true");
  // "Fjern alle", then the two who are asked about.
  await page.getByRole("button", { name: "Fjern alle" }).click();
  await expect(list.getByRole("option", { selected: true })).toHaveCount(0);
  await list.getByRole("option", { name: "Anna" }).click();
  await list.getByRole("option", { name: "Bo" }).click();
  await page.getByRole("button", { name: "Færdig (2 valgt)" }).click();
  await expect(list).toHaveCount(0);
  await expect(players).toHaveText(/Anna, Bo/);
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

  // A very long message stops at the cap (max-h-48) and scrolls inside the box.
  await box.fill(Array.from({ length: 30 }, (_, i) => `Linje ${i + 1}`).join("\n"));
  await expect.poll(height).toBe(192);

  // Enter makes a new line in the box; it does not send.
  await box.fill("Første");
  await box.press("Enter");
  await expect(box).toHaveValue("Første\n");
  expect(await db.chatMessage.count()).toBe(0);

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
  // The chat has no tab to light up: the header's chat button says it has hydrated, with
  // the scroll listener in place.
  await expect(page.getByRole("banner").getByRole("link", { name: "Chat", exact: true })).toHaveAttribute("data-hydrated", "true");
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
  await expect(page.getByRole("navigation").last().getByRole("link", { name: "Profil" })).toBeInViewport({ ratio: 1 });
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

test("the header's chat button counts the unread messages, and the chat clears it", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await db.chatMessage.createMany({
    data: [
      { teamId: team.id, authorId: bo.id, body: "Hvem kommer?" },
      { teamId: team.id, authorId: bo.id, body: "Husk støvler" },
    ],
  });
  await loginAs(anna);
  await page.goto("/oversigt");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Chat, 2 ulæste" })).toBeVisible();
  await expect(header.getByTestId("chat-unread")).toHaveText("2");

  await header.getByRole("link", { name: "Chat, 2 ulæste" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByText("Husk støvler")).toBeVisible();
  await expect(header.getByRole("link", { name: "Chat", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(header.getByTestId("chat-unread")).toHaveCount(0);

  // Left again: what was read stays read, and the chat is no longer a tab in the bar.
  await page.getByRole("navigation").last().getByRole("link", { name: "Bøder" }).click();
  await expect(page).toHaveURL(/\/boder$/);
  await expect(header.getByRole("link", { name: "Chat", exact: true })).not.toHaveAttribute("aria-current");
  await expect(header.getByTestId("chat-unread")).toHaveCount(0);
  await expect(page.getByRole("navigation").last().getByRole("link", { name: "Chat" })).toHaveCount(0);

  // A new message counts again.
  await db.chatMessage.create({ data: { teamId: team.id, authorId: bo.id, body: "Ny besked" } });
  await page.reload();
  await expect(header.getByTestId("chat-unread")).toHaveText("1");
});

test("the chat opens on the latest 25 messages and fetches older ones as it is scrolled up", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  await db.chatMessage.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({
      teamId: team.id,
      authorId: i % 2 ? anna.id : bo.id,
      body: `Besked ${i + 1}`,
      createdAt: new Date(Date.now() - (60 - i) * 60_000),
    })),
  });
  await loginAs(anna);
  await page.goto("/chat");
  const message = (n: number) => page.getByText(`Besked ${n}`, { exact: true });
  await expect(message(60)).toBeInViewport();
  await expect(message(36)).toHaveCount(1);
  await expect(message(35)).toHaveCount(0);

  // Up to the top: the page before arrives above, and what was read stays where it was.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(message(11)).toHaveCount(1);
  await expect(message(36)).toBeInViewport();
  await expect(message(10)).toHaveCount(0);

  // Up again, to the very first message: there is nothing older to fetch.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(message(1)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Vis ældre beskeder" })).toHaveCount(0);
  await expect(page.locator("ol > li")).toHaveCount(60);

  // A new message lands below, and the older ones stay.
  await db.chatMessage.create({ data: { teamId: team.id, authorId: bo.id, body: "Besked 61" } });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(message(61)).toHaveCount(1);
  await expect(message(1)).toHaveCount(1);
});

test("a comment and a chat message are reacted to, and the reaction stands after a reload", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const post = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Kamp i morgen" } });
  await db.postComment.create({ data: { postId: post.id, authorId: anna.id, body: "Husk benskinner" } });
  const asked = await db.chatMessage.create({ data: { teamId: team.id, authorId: anna.id, body: "Hvem kører?" } });
  await loginAs(bo);

  await page.goto("/oversigt");
  await page.getByRole("button", { name: "1 kommentar", exact: true }).click();
  const comments = page.getByRole("dialog", { name: "Kommentarer" });
  // From the keyboard or a screen reader, a button does what holding does.
  await comments.getByRole("button", { name: "Reager eller svar på Annas kommentar" }).focus();
  await page.keyboard.press("Enter");
  // The menu lies over the drawer; choosing a reaction leaves the drawer open.
  await page.getByRole("group", { name: "Vælg en reaktion" }).getByRole("button", { name: "Griner 😂" }).click();
  await expect(comments.getByRole("button", { name: "1 reaktion: Bo har reageret" })).toBeVisible();
  await expect.poll(() => db.reaction.count({ where: { postCommentId: { not: null }, kind: "LAUGH" } })).toBe(1);
  // Held, the comment brings up the reactions, the viewer's marked; Escape closes the menu and not the drawer.
  await hold(page, comments.getByText("Husk benskinner"));
  await expect(page.getByRole("group", { name: "Vælg en reaktion" }).getByRole("button", { name: "Griner 😂" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Vælg en reaktion" })).toBeHidden();
  await expect(comments).toBeVisible();
  // Holding gave nothing of itself.
  await expect.poll(() => db.reaction.count()).toBe(1);

  // A chat message is held the same way: the crown, first in the row.
  await page.goto("/chat");
  await hold(page, page.getByText("Hvem kører?"));
  await page.getByRole("group", { name: "Vælg en reaktion" }).getByRole("button", { name: "Krone 👑" }).click();
  await expect.poll(() => db.reaction.count({ where: { chatMessageId: { not: null }, kind: "CROWN" } })).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "1 reaktion: Bo har reageret" })).toBeVisible();

  // "Svar" quotes the message above the box, as in Messenger; the answer shows it quoted.
  const original = page.locator(`#chat-message-${asked.id}`).getByText("Hvem kører?", { exact: true });
  await holdAndChoose(page, original, "Svar");
  const box = page.getByRole("textbox", { name: "Besked" });
  await expect(page.getByText("Svarer Anna")).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");
  await box.fill("Jeg kan køre");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const quote = page.getByRole("button", { name: "Svar på Annas besked: Hvem kører?" });
  await expect(quote).toBeVisible();
  await expect(page.getByText("Svarer Anna")).toHaveCount(0);
  await expect.poll(async () => (await db.chatMessage.findFirst({ where: { authorId: bo.id } }))?.replyToId).toBe(asked.id);
  // "Annuller svar" sends a plain message.
  await holdAndChoose(page, original, "Svar");
  await page.getByRole("button", { name: "Annuller svar" }).click();
  await expect(page.getByText("Svarer Anna")).toHaveCount(0);

  // Anna sees Bo's reaction in the tabs, and may delete her own message from the menu;
  // the answer stays, without the quote.
  await loginAs(anna);
  await page.goto("/chat");
  await page.getByRole("button", { name: "1 reaktion: Bo har reageret" }).click();
  const reacted = page.getByRole("dialog", { name: "Reaktioner" });
  await expect(reacted.getByRole("tab", { name: "Krone 1" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reacted).toBeHidden();
  await holdAndChoose(page, page.locator(`#chat-message-${asked.id}`).getByText("Hvem kører?", { exact: true }), "Slet");
  await expect(page.locator(`#chat-message-${asked.id}`)).toHaveCount(0);
  await expect(page.getByText("Jeg kan køre")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Svar på / })).toHaveCount(0);
  await expect.poll(() => db.chatMessage.count()).toBe(1);
});

test("a comment sent under a long thread is scrolled into view", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const post = await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Sejr 3-1!" } });
  await db.postComment.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({ postId: post.id, authorId: anna.id, body: `Kommentar nummer ${i + 1}`, createdAt: new Date(Date.UTC(2026, 10, 1, 12, i)) })),
  });

  await loginAs(bo);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "25 kommentarer" }).click();
  const drawer = page.getByRole("dialog", { name: "Kommentarer" });
  await expect(drawer.getByText("Kommentar nummer 1", { exact: true })).toBeInViewport();
  await drawer.getByRole("textbox", { name: "Kommentar", exact: true }).fill("Min nye kommentar");
  await drawer.getByRole("button", { name: "Send" }).click();
  await expect(drawer.getByText("Min nye kommentar")).toBeInViewport();
});

test("the feed is searched by its words, its writers and its comments, and closing the search brings it back", async ({ page, loginAs }) => {
  const { team, anna, bo } = await squad();
  const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12));
  await db.post.create({ data: { teamId: team.id, authorId: anna.id, body: "Husk benskinner på lørdag", createdAt: at(1) } });
  const other = await db.post.create({ data: { teamId: team.id, authorId: bo.id, body: "Flot kamp i går", createdAt: at(2) } });
  await db.postComment.create({ data: { postId: other.id, authorId: anna.id, body: "Og mine benskinner?" } });
  await db.post.create({ data: { teamId: team.id, authorId: bo.id, body: "Grill efter træning", createdAt: at(3) } });

  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Søg i feedet" }).click();
  const box = page.getByRole("searchbox", { name: "Søg i feedet" });
  await expect(box).toBeFocused();
  await box.fill("benskinner");
  const found = page.getByRole("region", { name: "Søgeresultater" });
  await expect(found.getByText("2 opslag med »benskinner«")).toBeVisible();
  // The newest first: Bo's, found by Anna's comment on it, then Anna's own words.
  await expect(found.getByText(/^(Flot kamp i går|Husk benskinner på lørdag|Grill efter træning)$/)).toHaveText([
    "Flot kamp i går",
    "Husk benskinner på lørdag",
  ]);
  await expect(page.getByText("Grill efter træning")).toBeHidden();

  await box.fill("hockey");
  await expect(found.getByText("Ingen opslag med »hockey«.")).toBeVisible();

  await page.getByRole("button", { name: "Luk" }).click();
  await expect(box).toBeHidden();
  await expect(page.getByText("Grill efter træning")).toBeVisible();
});

test("the feed follows the front page's banner down on arrival, and fades as it rolls up on leaving", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  const banner = page.locator(".page-banner");
  const feed = page.locator("#feed");
  await expect(feed).toBeVisible();
  expect(await banner.evaluate((el) => getComputedStyle(el).animationName)).toBe("banner-down");
  expect(await feed.evaluate((el) => getComputedStyle(el).animationName)).toBe("banner-follow");
  // Once down, nothing is left moved: the feed sits where it belongs.
  await expect.poll(() => feed.evaluate((el) => getComputedStyle(el).translate)).toBe("none");

  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/boder(\?|$)/, async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole("navigation").last().getByRole("link", { name: "Bøder" }).click();
  await expect(banner).toHaveAttribute("data-leaving", "true");
  await expect.poll(() => feed.evaluate((el) => getComputedStyle(el).animationName)).toBe("banner-content-out");
  release();
  await expect(page).toHaveURL(/\/boder$/);
});
