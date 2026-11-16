import { test, expect } from "./helpers/fixtures";
import { db, squad } from "./helpers/database";

test("a player's page shows their latest fines and challenges and their next job, and no way to edit somebody else", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna, bo } = await squad();
  const other = await squad("Naboerne");
  const match = await db.match.create({
    data: {
      teamId: team.id,
      title: "Kamp",
      opponent: "FC Naboen",
      startsAt: new Date(Date.now() + 3 * 86_400_000),
    },
  });
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: bo.id,
      reason: "Glemt trøje",
      units: 2,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    },
  });
  await db.challenge.create({
    data: {
      teamId: team.id,
      winnerId: anna.id,
      loserId: bo.id,
      reportedById: anna.id,
      description: "Flest straffe",
      units: 1,
    },
  });
  await db.task.create({
    data: {
      teamId: team.id,
      matchId: match.id,
      title: "Vaske trøjer",
      assignees: { create: { userId: bo.id } },
    },
  });
  // Somebody else's job, and another team's, stay off Bo's page.
  await db.task.create({
    data: {
      teamId: team.id,
      matchId: match.id,
      title: "Kridte banen",
      assignees: { create: { userId: anna.id } },
    },
  });
  await db.fine.create({
    data: {
      teamId: other.team.id,
      playerId: other.bo.id,
      reason: "Naboens bøde",
      units: 1,
      unitPriceKr: 10,
      issuedById: other.treasurer.id,
    },
  });

  await loginAs(anna);
  await page.goto(`/spiller/${bo.id}`);
  await expect(
    page.getByRole("heading", { name: "Bo", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Detaljer" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const details = page.getByRole("tabpanel", { name: "Detaljer" });
  const latest = details.getByRole("region", { name: "Seneste" });
  await expect(latest.getByText("Glemt trøje")).toBeVisible();
  await expect(latest.getByText(/“Flest straffe”/)).toBeVisible();
  await expect(
    details
      .getByRole("region", { name: "Næste opgave" })
      .getByText("Vaske trøjer"),
  ).toBeVisible();
  await expect(page.getByText("Kridte banen")).toHaveCount(0);
  await expect(page.getByText("Naboens bøde")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Rediger" })).toHaveCount(0);

  // A fine is a row; tapped, it opens as in the history, and Anna (not its giver) may not delete it.
  await latest.getByRole("button", { name: /Glemt trøje/ }).click();
  const fine = page.getByRole("dialog", { name: "Bøde" });
  await expect(fine.getByText("Pris pr. bøde")).toBeVisible();
  await expect(fine.getByRole("link", { name: "Kasserer Kim" })).toBeVisible();
  await expect(fine.getByRole("button", { name: "Slet bøden" })).toHaveCount(0);
  await fine.getByRole("button", { name: "Luk" }).click();
  await expect(fine).toBeHidden();

  // Each list has its own tab, and its own address.
  await page.getByRole("tab", { name: "Bøder (1)" }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}/boder$`));
  await expect(
    page.getByRole("tabpanel", { name: "Bøder (1)" }).getByText("Glemt trøje"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Opgaver (1)" }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}/opgaver$`));
  await expect(
    page
      .getByRole("tabpanel", { name: "Opgaver (1)" })
      .getByText("Vaske trøjer"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Udfordringer (1)" }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}/udfordringer$`));

  // The challenge is a short row; tapped, it opens in full, and a name there leads on.
  await page
    .getByRole("tabpanel", { name: "Udfordringer (1)" })
    .getByRole("button", { name: /Anna 🏆 slog Bo/ })
    .click();
  const sheet = page.getByRole("dialog", { name: "Udfordring" });
  await sheet.getByRole("link", { name: /^Anna/ }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
  await expect(
    page.getByRole("heading", { name: "Anna", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Detaljer" }).getByText("Kridte banen"),
  ).toBeVisible();
});

test("a player's page opens straight on a tab", async ({ page, loginAs }) => {
  const { team, treasurer, anna } = await squad();
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      reason: "Glemt bolde",
      units: 1,
      unitPriceKr: 10,
      issuedById: treasurer.id,
    },
  });
  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}/boder`);
  await expect(page.getByRole("tab", { name: "Bøder (1)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goto(`/spiller/${anna.id}/udfordringer`);
  await expect(page.getByRole("tab", { name: "Udfordringer" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Ingen udfordringer endnu.")).toBeVisible();
  await page.goto(`/spiller/${anna.id}/opgaver`);
  await expect(page.getByRole("tab", { name: "Opgaver" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Ingen opgaver.", { exact: true })).toBeVisible();
});

test("your own page is your profile: the tab bar's Profil opens it, and Rediger leads to the settings", async ({
  page,
  loginAs,
}) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/oversigt");
  const profileTab = page
    .getByRole("navigation")
    .last()
    .getByRole("link", { name: "Profil" });
  await profileTab.click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
  await expect(profileTab).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Anna", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Rediger" }).click();
  await expect(page).toHaveURL(/\/profil$/);
  await expect(page.getByLabel("Navn")).toHaveValue("Anna");
  // The settings are in the same tab.
  await expect(profileTab).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Se min side" }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}$`));
});

test("names in the feed, the comments and the chat open the person's page", async ({
  page,
  loginAs,
}) => {
  const { team, anna, bo } = await squad();
  const post = await db.post.create({
    data: { teamId: team.id, authorId: anna.id, body: "Sejr 3-1!" },
  });
  await db.postComment.create({
    data: { postId: post.id, authorId: bo.id, body: "Det mål i 89. minut" },
  });
  await db.chatMessage.create({
    data: { teamId: team.id, authorId: anna.id, body: "Hej holdet" },
  });

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

test("the rights tab opens each player's page", async ({ page, loginAs }) => {
  const { admin, bo } = await squad();
  await loginAs(admin);
  await page.goto("/hold/rettigheder");
  await page
    .getByRole("tabpanel", { name: "Rettigheder" })
    .getByRole("link", { name: "Bo", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}$`));
});

test("an old link to a player's fines lands on their page", async ({
  page,
  loginAs,
}) => {
  const { anna, bo } = await squad();
  await loginAs(anna);
  await page.goto(`/boder/spiller/${bo.id}`);
  await expect(page).toHaveURL(new RegExp(`/spiller/${bo.id}$`));
  await expect(
    page.getByRole("heading", { name: "Bo", level: 1 }),
  ).toBeVisible();
});

test("Seneste shows the three newest fines and challenges; the tabs show them all", async ({
  page,
  loginAs,
}) => {
  const { team, treasurer, anna, bo } = await squad();
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
  for (const n of [1, 3, 5, 6]) {
    await db.fine.create({
      data: {
        teamId: team.id,
        playerId: anna.id,
        reason: `Bøde nummer ${n}`,
        units: 1,
        unitPriceKr: 10,
        issuedById: treasurer.id,
        createdAt: minutesAgo(n),
      },
    });
  }
  await db.challenge.create({
    data: {
      teamId: team.id,
      winnerId: bo.id,
      loserId: anna.id,
      reportedById: bo.id,
      description: "Flest mål",
      units: 1,
      createdAt: minutesAgo(2),
    },
  });
  // A settled challenge left fines behind; Seneste shows the challenge, not its fine too.
  const settled = await db.challenge.create({
    data: {
      teamId: team.id,
      winnerId: anna.id,
      loserId: bo.id,
      reportedById: anna.id,
      description: "Længst spark",
      units: 1,
      status: "SETTLED",
      createdAt: minutesAgo(30),
    },
  });
  await db.fine.create({
    data: {
      teamId: team.id,
      playerId: anna.id,
      reason: "Udfordring vundet",
      units: -1,
      unitPriceKr: 10,
      issuedById: anna.id,
      challengeId: settled.id,
      createdAt: minutesAgo(0),
    },
  });

  await loginAs(anna);
  await page.goto(`/spiller/${anna.id}`);
  const latest = page
    .getByRole("tabpanel", { name: "Detaljer" })
    .getByRole("region", { name: "Seneste" });
  await expect(latest.getByRole("listitem")).toHaveCount(3);
  await expect(latest.getByRole("listitem").nth(0)).toContainText(
    "Bøde nummer 1",
  );
  await expect(latest.getByRole("listitem").nth(1)).toContainText("Flest mål");
  await expect(latest.getByRole("listitem").nth(2)).toContainText(
    "Bøde nummer 3",
  );
  await expect(latest.getByText("Udfordring vundet")).toHaveCount(0);
  await expect(
    page
      .getByRole("tabpanel", { name: "Detaljer" })
      .getByText("Ingen opgaver lige nu."),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Bøder (5)" }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Bøder (5)" })
      .getByText("Bøde nummer 6"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Udfordringer (2)" }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Udfordringer (2)" })
      .getByText(/Længst spark/),
  ).toBeVisible();
});

test("the next job is the one due first, and the home page's jobs tile opens the jobs tab", async ({
  page,
  loginAs,
}) => {
  const { team, anna } = await squad();
  const later = await db.match.create({
    data: {
      teamId: team.id,
      title: "Kamp",
      opponent: "FC Senere",
      startsAt: new Date(Date.now() + 9 * 86_400_000),
    },
  });
  const sooner = await db.match.create({
    data: {
      teamId: team.id,
      title: "Kamp",
      opponent: "FC Snart",
      startsAt: new Date(Date.now() + 2 * 86_400_000),
    },
  });
  for (let n = 1; n <= 6; n++) {
    await db.task.create({
      data: {
        teamId: team.id,
        matchId: later.id,
        title: `Opgave nr. ${n}`,
        assignees: { create: { userId: anna.id } },
      },
    });
  }
  await db.task.create({
    data: {
      teamId: team.id,
      matchId: sooner.id,
      title: "Tage bolde med",
      assignees: { create: { userId: anna.id } },
    },
  });

  await loginAs(anna);
  await page.goto("/oversigt");
  await page.getByRole("link", { name: /Opgaver\s*7\s*til dig/ }).click();
  await expect(page).toHaveURL(new RegExp(`/spiller/${anna.id}/opgaver$`));
  await expect(page.getByRole("tab", { name: "Opgaver (7)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page
      .getByRole("tabpanel", { name: "Opgaver (7)" })
      .getByText("Opgave nr. 6"),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Detaljer" }).click();
  const next = page
    .getByRole("tabpanel", { name: "Detaljer" })
    .getByRole("region", { name: "Næste opgave" });
  await expect(next.getByText("Tage bolde med")).toBeVisible();
  await expect(next.getByRole("listitem")).toHaveCount(1);
});
