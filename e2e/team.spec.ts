import { test, expect } from "./helpers/fixtures";
import { db, member, squad } from "./helpers/database";
import { choose, chooseMany } from "./helpers/select";

test("a coach renames the team, then changes the price of a fine on its own tab", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  await db.team.update({ where: { id: team.id }, data: { calendarUrl: "https://kampklar.dk/feed/abc.ics" } });
  await loginAs(admin);
  await page.goto("/hold");
  await expect(page.getByRole("tab", { name: "Holdet" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Holdets navn").fill("Swingkings Old Boys");
  await page.locator("label").filter({ hasText: /^Grøn$/ }).click();
  await expect(page.getByRole("radio", { name: "Grøn" })).toBeChecked();
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  expect(await db.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({ name: "Swingkings Old Boys", theme: "GREEN" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "GREEN");

  // The tabs are turned like the fine box's, and the address follows.
  await page.getByRole("tab", { name: "Betaling" }).click();
  await expect(page).toHaveURL(/\/hold\/betaling$/);
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Betaling");
  await page.getByLabel("Pris for én bøde (kr)").fill("15");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();
  // Saving one tab leaves the others' settings as they were.
  expect(await db.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({
    name: "Swingkings Old Boys",
    finePriceKr: 15,
    calendarUrl: "https://kampklar.dk/feed/abc.ics",
  });
});

test("each tab of the team settings has its own address, and no other does", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  for (const [fane, name] of [["betaling", "Betaling"], ["opgaver", "Opgaver"], ["rettigheder", "Rettigheder"], ["inviter", "Inviter"]]) {
    await page.goto(`/hold/${fane}`);
    await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveAccessibleName(name);
  }
  expect((await page.goto("/hold/noget-andet"))?.status()).toBe(404);
  // The old roster address leads to the rights tab.
  await page.goto("/hold/spillere");
  await expect(page).toHaveURL(/\/hold\/rettigheder$/);
  await expect(page.getByRole("tabpanel", { name: "Rettigheder" }).getByRole("checkbox", { name: "Admin for Anna" })).toBeVisible();
});

test("the KampKlar link and the standard jobs share the Opgaver tab", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold/opgaver");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Opgaver");
  await expect(page.getByRole("button", { name: "Ny standardopgave" })).toBeVisible();
  await expect(page.getByLabel("Kalenderlink fra DBU KampKlar")).toBeVisible();
  await expect(page.getByLabel("Holdets navn")).toBeHidden();
});

test("an admin makes a standard job automatic on away matches only", async ({ page, loginAs }) => {
  const { team, admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold/opgaver");
  await page.getByRole("button", { name: "Ny standardopgave" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny standardopgave" });
  await dialog.getByLabel("Opgave").fill("Kørsel");
  await choose(dialog.getByLabel("Tilføj automatisk til nye kampe fra KampKlar"), "Kun udekampe");
  await dialog.getByRole("button", { name: "Gem" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Automatisk · ude")).toBeVisible();
  await expect
    .poll(async () => db.taskTemplate.findFirst({ where: { teamId: team.id }, select: { autoAdd: true, autoVenue: true } }))
    .toEqual({ autoAdd: true, autoVenue: "AWAY" });

  await page.getByRole("button", { name: "Handlinger for Kørsel" }).click();
  await page.getByRole("dialog", { name: "Kørsel" }).getByRole("button", { name: "Ret", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Ret standardopgave" });
  await expect(edit.getByLabel("Tilføj automatisk til nye kampe fra KampKlar")).toHaveText("Kun udekampe");
});

test("a KampKlar link that is not a web address is refused with a reason", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold/opgaver");
  await page.getByLabel("Kalenderlink fra DBU KampKlar").fill("ftp://kampklar.dk/kalender.ics");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText(/Kalenderlinket er ikke en gyldig adresse/)).toBeVisible();
});

test("a player is kept out of the team settings", async ({ page, loginAs }) => {
  const { anna } = await squad();
  await loginAs(anna);
  await page.goto("/hold");
  await expect(page.getByLabel("Holdets navn")).toHaveCount(0);
});

test("a coach removes a player, who no longer reaches the team", async ({ page, loginAs }) => {
  const { team, admin, bo } = await squad();
  await loginAs(admin);
  await page.goto("/hold/rettigheder");
  const row = page.getByRole("listitem").filter({ has: page.getByText("Bo", { exact: true }) });
  await row.getByRole("button", { name: "Handlinger for Bo" }).click();
  await page.getByRole("dialog", { name: "Bo" }).getByRole("button", { name: "Fjern fra holdet" }).click();
  // Nothing that cannot be undone happens on the first press: it asks first.
  await page.getByRole("dialog", { name: "Fjern Bo fra holdet?" }).getByRole("button", { name: "Fjern fra holdet" }).click();
  await expect.poll(() => db.teamMember.count({ where: { teamId: team.id, userId: bo.id } })).toBe(0);
  // The page has taken the answer in before it is left: a navigation started while the
  // action's own refresh is still on its way is aborted.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row).toHaveCount(0);

  await loginAs(bo);
  await page.goto("/oversigt");
  await expect(page).toHaveURL(/\/hold\/vaelg$/);
});

test("one team never sees another's fines, matches or chat", async ({ page, loginAs }) => {
  const ours = await squad("Swingkings");
  const theirs = await squad("Naboerne");
  await db.fine.create({ data: { teamId: theirs.team.id, playerId: theirs.anna.id, reason: "Hemmelig bøde", units: 1, unitPriceKr: 10, issuedById: theirs.admin.id } });
  const match = await db.match.create({ data: { teamId: theirs.team.id, title: "Naboerne - Hemmelig FC", opponent: "Hemmelig FC", startsAt: new Date(Date.now() + 86_400_000) } });
  await db.chatMessage.create({ data: { teamId: theirs.team.id, authorId: theirs.anna.id, body: "Hemmelig besked" } });

  await loginAs(ours.anna);
  for (const path of ["/boder", "/aktiviteter", "/chat", "/oversigt"]) {
    await page.goto(path);
    await expect(page.getByText(/Hemmelig/), path).toHaveCount(0);
  }
  const response = await page.goto(`/aktiviteter/${match.id}`);
  expect(response?.status()).toBe(404);
});

test("somebody on two teams switches between them", async ({ page, loginAs }) => {
  const first = await squad("Swingkings");
  const second = await db.team.create({ data: { name: "Søndagsholdet" } });
  await db.teamMember.create({ data: { teamId: second.id, userId: first.anna.id } });
  await member(second.id, "Carl");
  await loginAs(first.anna);
  await page.goto("/oversigt");
  await page.getByRole("button", { name: "Swingkings" }).click();
  await page.getByRole("button", { name: /Søndagsholdet/ }).or(page.getByRole("link", { name: /Søndagsholdet/ })).first().click();
  await expect(page.getByRole("button", { name: "Søndagsholdet" })).toBeVisible();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: first.anna.id } })).activeTeamId).toBe(second.id);
});

test("the rights tab lists everybody on the team", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await loginAs(admin);
  await page.goto("/hold/rettigheder");
  const tab = page.getByRole("tabpanel", { name: "Rettigheder" });
  for (const name of ["Anna", "Bo", "Kasserer Kim", "Træner Tom"]) await expect(tab.getByText(name, { exact: true })).toBeVisible();
  await expect(tab.getByRole("checkbox", { name: "Bøder for Kasserer Kim" })).toHaveAttribute("aria-checked", "true");
});

test("a coach sends a reminder to the players ticked, opening MobilePay with the kontingent filled in", async ({ page, loginAs }) => {
  const { team, admin, anna, bo } = await squad();
  await db.team.update({ where: { id: team.id }, data: { mobilePayLink: "https://qr.mobilepay.dk/box/b865a6da-62a7-4360-a406-b39a192c757e/pay-in", duesKr: 600 } });
  for (const who of [anna, bo]) {
    await db.pushSubscription.create({ data: { userId: who.id, endpoint: `https://8.8.8.8/push/${who.name}`, p256dh: "B".repeat(87), auth: "a".repeat(22) } });
  }
  await loginAs(admin);
  await page.goto("/hold/besked");
  const tab = page.getByRole("tabpanel", { name: "Besked" });
  await choose(tab.getByLabel("Til", { exact: true }), "Udvalgte spillere");
  await chooseMany(tab.getByLabel("Modtagere"), ["Anna", "Bo"]);
  await choose(tab.getByLabel("Åbner", { exact: true }), "MobilePay: betal kontingent");
  await tab.getByLabel("Overskrift", { exact: true }).fill("Husk kontingent");
  await tab.getByRole("textbox", { name: "Besked" }).fill("Senest fredag.");
  await tab.getByRole("button", { name: "Send notifikation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sendt til 2 personer." })).toBeVisible();

  // An outside link that is not https is refused before anything is sent.
  await choose(tab.getByLabel("Åbner", { exact: true }), "Et andet link…");
  await tab.getByLabel("Link", { exact: true }).fill("https://localhost");
  await tab.getByLabel("Overskrift", { exact: true }).fill("Stævne");
  await tab.getByRole("textbox", { name: "Besked" }).fill("Se mere her.");
  await tab.getByRole("button", { name: "Send notifikation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Linket skal være en hel adresse, der starter med https://" })).toBeVisible();
});

test("on a phone the six tab names stay on one line each, and the one opened is in view", async ({ page, loginAs }) => {
  const { admin } = await squad();
  await page.setViewportSize({ width: 360, height: 800 });
  await loginAs(admin);
  await page.goto("/hold/besked");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(6);
  const heights = await tabs.evaluateAll((all) => all.map((tab) => tab.getBoundingClientRect().height));
  expect(Math.max(...heights)).toBeLessThan(40);
  await expect(page.getByRole("tab", { name: "Besked" })).toBeInViewport({ ratio: 0.95 });
  await page.getByRole("tab", { name: "Holdet" }).click();
  await expect(page).toHaveURL(/\/hold$/);
  await expect(page.getByRole("tab", { name: "Holdet" })).toBeInViewport({ ratio: 0.95 });
});
