import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { MemberRole, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { applyCalendar } from "./kampklar";
import { settleChallenge } from "./fines";
import { removeStored, storePhoto } from "./photos";
import { demoPicture } from "./demo-pictures";

/**
 * A team worth looking at: "Swingkings Demo" in the middle of its season. Eighteen made-up
 * people, a fine catalogue, four months of fines (everybody reset once, one player reset
 * again), challenges waiting, approved and withdrawn, a calendar of some forty activities
 * read through the real KampKlar import, standard jobs done and to do, sign-ups, a chat
 * that has been going for weeks, and a feed with pictures, likes, comments and polls open
 * and closed. Made (or remade) by `npm run db:demo` locally and by the super admin's
 * "Opret testhold" on /admin, and thrown away again by `removeDemoTeam`.
 *
 * Everything it makes is marked `isDemo`, and removing it deletes what is marked and
 * nothing else — whatever a real team is called, and whatever address somebody signs up
 * with. Crosses teams on purpose, so `prisma` directly.
 *
 * The same team comes out every time: what looks random is drawn from a fixed seed. Rows
 * are written in bulk (`createMany`), because the button on /admin waits for all of it.
 */
export const DEMO_TEAM_NAME = "Swingkings Demo";
export const DEMO_EMAIL_DOMAIN = "@demo.swingkings.dk";

const DAY_MS = 86_400_000;
/** How long ago the treasurer reset everybody: fines older than this are history. */
const RESET_DAYS = 40;
const HOME_GROUND = "Kunstgræsbanen, Valby Idrætspark";

/** Name, role, shirt number. The first is the admin, the last the coach who takes no jobs. */
const PEOPLE: readonly (readonly [string, MemberRole, number | null])[] = [
  ["Mads Holm", "ADMIN", 1],
  ["Jonas Berg", "TREASURER", 4],
  ["Frederik Lund", "PLAYER", 7],
  ["Oliver Krog", "PLAYER", 9],
  ["Emil Dahl", "PLAYER", 10],
  ["Lucas Friis", "PLAYER", 11],
  ["Victor Bach", "PLAYER", 14],
  ["Noah Skov", "PLAYER", 23],
  ["William Juhl", "PLAYER", 2],
  ["Magnus Thorsen", "PLAYER", 3],
  ["Malthe Kjær", "PLAYER", 5],
  ["Anton Nygaard", "PLAYER", 6],
  ["Sebastian Vest", "PLAYER", 8],
  ["Rasmus Brandt", "PLAYER", 12],
  ["Kasper Lind", "PLAYER", 15],
  ["Nikolaj Ravn", "PLAYER", 17],
  ["Tobias Høj", "PLAYER", 19],
  ["Henrik Storm", "ADMIN", null],
];

const FINE_TYPES: readonly (readonly [string, number])[] = [
  ["For sent til træning", 2],
  ["For sent til kamp", 5],
  ["Glemt udstyr", 2],
  ["Afbud efter deadline", 5],
  ["Gult kort (brok)", 5],
  ["Rødt kort", 15],
  ["Mobil i omklædningsrummet", 1],
  ["Brændt straffespark", 3],
  ["Selvmål", 5],
  ["Tunnel til træning", 1],
  ["Glemt at svare i appen", 2],
  ["Udeblevet uden afbud", 10],
  ["Forkerte strømper", 1],
];
/** What a match and a training usually cost somebody; a name twice is twice as likely. */
const MATCH_FINES = ["For sent til kamp", "Glemt udstyr", "Afbud efter deadline", "Gult kort (brok)", "Gult kort (brok)", "Brændt straffespark", "Selvmål", "Glemt at svare i appen", "Forkerte strømper", "Forkerte strømper"];
const TRAINING_FINES = ["For sent til træning", "For sent til træning", "Glemt udstyr", "Mobil i omklædningsrummet", "Tunnel til træning", "Tunnel til træning", "Glemt at svare i appen", "Forkerte strømper"];
const FINE_NOTES = ["Tredje gang i denne måned", "Påstår det var togets skyld", "Lånte et par af Mads", "Dommeren var ikke enig", "Indrømmede det selv", "Der er vidner"];

/** The matches played, newest first: opponent, at home, our goals, theirs. One a week. */
const PLAYED: readonly (readonly [string, boolean, number, number])[] = [
  ["Hvidovre IF", false, 3, 1],
  ["Brønshøj BK", true, 2, 2],
  ["Husum BK", false, 1, 4],
  ["Sundby BK", true, 4, 0],
  ["Tårnby FF", false, 2, 1],
  ["Skjold", true, 0, 1],
  ["Kastrup BK", false, 3, 3],
  ["Herlev IF", true, 5, 2],
  ["Rødovre BK", false, 1, 0],
  ["Ballerup BK", true, 2, 3],
  ["GVI", false, 2, 0],
  ["Fremad Valby", true, 1, 1],
];
/** The matches to come: opponent, at home, days from now, kick-off, where, note. */
const COMING: readonly (readonly [string, boolean, number, number, number, string | null, string | null])[] = [
  ["B.93", true, 6, 14, 30, HOME_GROUND, "Mødetid 13:45"],
  ["Vanløse IF", false, 13, 12, 0, "Vanløse Idrætspark", "Mødetid 11:00 – vi kører samlet fra klubhuset"],
  ["Fremad Amager", true, 20, 15, 0, HOME_GROUND, null],
  ["FA 2000", false, 27, 13, 0, "Frederiksberg Idrætspark", null],
  ["BK Frem", true, 34, 14, 0, HOME_GROUND, "Sidste hjemmekamp – tag familien med"],
  ["Tårnby FF", true, 41, 13, 30, HOME_GROUND, null],
];
const PAST_TRAININGS = 10;
const COMING_TRAININGS = 6;

/** Chat, oldest first: days ago, hour, minute, who, what. The last five are from just now. */
const CHAT: readonly (readonly [number, number, number, string, string])[] = [
  [20, 17, 5, "Mads", "Velkommen til de nye i chatten 👋 Her aftaler vi kørsel, afbud og alt det løse."],
  [20, 17, 12, "Tobias", "Tak! Hvornår er der træning?"],
  [20, 17, 14, "Henrik", "Tirsdag kl. 18 på bane 3. Kom i god tid."],
  [20, 17, 31, "Jonas", "Og husk at bødekassen også gælder nye spillere 😇"],
  [19, 21, 40, "Victor", "Undskyld for i dag, drenge. Det røde var fortjent."],
  [19, 21, 44, "Anton", "Det første gule var billigt. Det andet… ja."],
  [19, 21, 47, "Jonas", "15 bøder. Tak for bidraget til julefrokosten 🍻"],
  [18, 9, 15, "Emil", "Er der nogen der har en ekstra bold derhjemme? Vi mangler to i nettet."],
  [18, 9, 52, "Kasper", "Jeg har en i bilen, tager den med tirsdag"],
  [16, 16, 20, "Henrik", "Træning i aften: vi starter med løb. Tag løbesko med ud over støvlerne."],
  [16, 16, 24, "Oliver", "Løb?! Jeg melder mig syg"],
  [16, 16, 25, "Henrik", "Afbud efter deadline, Oliver. Det er 5 bøder."],
  [16, 16, 26, "Oliver", "…vi ses kl. 18"],
  [14, 20, 3, "Magnus", "Hvem har trøjerne efter Brønshøj-kampen?"],
  [14, 20, 10, "Rasmus", "Mig. De hænger til tørre."],
  [13, 12, 30, "William", "Kan nogen køre på lørdag? Min bil er på værksted."],
  [13, 12, 41, "Nikolaj", "Jeg har plads til tre"],
  [13, 12, 45, "Malthe", "Jeg tager den ene plads 🙋"],
  [12, 17, 50, "Emil", "2-2. Vi skulle have lukket den kamp."],
  [12, 17, 55, "Frederik", "Enig. Men flot comeback af dem, det må man give dem."],
  [12, 18, 2, "Sebastian", "Billede fra opvarmningen 📸"],
  [11, 8, 30, "Mads", "Husk at svare på aktiviteterne i appen, så Henrik kan sætte holdet."],
  [10, 19, 15, "Noah", "Er der nogen der skal se landskampen i klubhuset i aften?"],
  [10, 19, 18, "Lucas", "Jeg kommer"],
  [10, 19, 20, "Tobias", "Også mig"],
  [10, 19, 33, "Kasper", "Jeg tager chips med"],
  [9, 18, 5, "Henrik", "God træning i dag. Tempoet var højt – sådan skal det se ud på lørdag."],
  [8, 14, 10, "Jonas", "Lucas er nulstillet i bødekassen. Resten af jer: se jer selv i spejlet."],
  [8, 14, 12, "Lucas", "En fri mand 🕊️"],
  [7, 10, 45, "Anton", "Nogen der vil spille padel søndag formiddag? Vi mangler en fjerde."],
  [7, 10, 58, "Sebastian", "Jeg er med"],
  [6, 21, 15, "Mads", "Holdet til Hvidovre ligger under aktiviteten. Mødetid 12:15."],
  [5, 16, 40, "Frederik", "3-1!! 🔥🔥🔥"],
  [5, 16, 42, "Oliver", "Det mål i 89. minut. Jeg har set det ti gange allerede."],
  [5, 16, 48, "Noah", "Straffesparkskonkurrencen bagefter tæller ikke 😤"],
  [5, 16, 49, "Frederik", "Den tæller. Tre bøder, tak."],
  [5, 17, 10, "Magnus", "Holdbillede fra i dag"],
  [4, 9, 5, "Jonas", "Husk at stemme på kampens spiller i feedet."],
  [3, 20, 30, "Rasmus", "Hvem har Trøjevask efter Hvidovre? Posen står stadig i klubhuset…"],
  [3, 20, 36, "William", "Det er vist mig. Henter den i morgen 🙈"],
  [2, 21, 10, "Henrik", "Tak for i aften. Vi kører samme opstilling mod B.93."],
  [1, 12, 20, "Sebastian", "Har nogen set mine handsker? Sorte, str. 9."],
  [1, 12, 31, "Tobias", "Tjek glemmekassen ved omklædningsrum 4"],
];
const CHAT_NOW: readonly (readonly [string, string])[] = [
  ["Mads", "Husk mødetid 13:45 på lørdag! 💪"],
  ["Oliver", "Jeg kommer lidt senere, sidder fast i trafikken 🙈"],
  ["Jonas", "Så er der bøde 😂"],
  ["Emil", "Nogen der kan tage mig med til udekampen?"],
  ["Victor", "Jeg har to pladser"],
];
/** The chat messages that carry a picture, by their text. */
const CHAT_PICTURES = ["Billede fra opvarmningen 📸", "Holdbillede fra i dag"];

/** The feed, oldest first: days ago, who, what, how many pictures, comments (who, what). */
const POSTS: readonly (readonly [number, string, string, number, readonly (readonly [string, string])[]])[] = [
  [82, "Mads", "Så er sæsonen i gang! 1-1 mod Fremad Valby i premieren. Godt kæmpet, drenge 👏", 1, [["Jonas", "Bødekassen er også i gang 😎"], ["Emil", "Vi tager dem i returkampen"]]],
  [75, "Frederik", "2-0 ude mod GVI. Rent bur til Mads 🧤", 0, [["Mads", "Endelig!"]]],
  [68, "Jonas", "Bødestatus: I skylder tilsammen en god julefrokost. Bliv endelig ved 🍻", 0, [["Oliver", "Jeg gør mit bedste"], ["Victor", "Oliver betaler halvdelen selv 😂"]]],
  [61, "Oliver", "1-0 i Rødovre! Sent mål, tre point og en bane som en kartoffelmark.", 1, [["Kasper", "Kartoflerne var på vores side i dag"]]],
  [54, "Magnus", "5-2 over Herlev. Emil med hattrick ⚽⚽⚽", 3, [["Emil", "Bolden står på kontoret nu"], ["William", "Og et selvmål fra Magnus, lad os ikke glemme det"], ["Magnus", "Det var en aflevering…"]]],
  [47, "Henrik", "Træningen på tirsdag rykkes til bane 2 – bane 3 er lukket for vinteren.", 0, []],
  [40, "Kasper", "Tak for en god aften til fællesspisningen 🍕 Vi gør det igen efter sidste kamp.", 0, [["Nikolaj", "Bedste pizza i Valby"], ["Malthe", "Jeg er stadig mæt"]]],
  [39, "Jonas", "Bødekassen er nulstillet efter fællesspisningen. Alle starter på en frisk – det holder nok en uge.", 0, [["Noah", "Tre dage, max"]]],
  [33, "Mads", "4-0 over Sundby! Sæsonens bedste kamp 🔥", 1, [["Henrik", "Sådan skal det gøres. Stolt af jer."], ["Anton", "Og ingen kort!"], ["Jonas", "Desværre ☹️"]]],
  [19, "Victor", "1-4 i Husum. Den taler vi ikke mere om. Undskyld for det røde 🙈", 0, [["Jonas", "15 bøder siger tak"], ["Anton", "Vi rejser os på lørdag"]]],
  [12, "Emil", "2-2 mod Brønshøj. To gange foran, to gange indhentet.", 0, [["Rasmus", "Et point er et point"]]],
  [4.8, "Frederik", "Sejr 3-1 over Hvidovre! Hvilken kamp 🔥", 1, [["Oliver", "Det mål i 89. minut 🤩"], ["Tobias", "Min første sejr i trøjen 🙌"], ["Mads", "Stærkt, drenge"]]],
  [2, "Henrik", "God træning i aftes. Husk benskinner på lørdag – B.93 sparker igennem.", 0, [["Lucas", "Noteret 🫡"]]],
  [1, "Sebastian", "Nogen der har set mine handsker? Sorte, str. 9. Sidst set i omklædningsrum 4 🧤", 0, [["Tobias", "Tjek glemmekassen"], ["Jonas", "Glemt udstyr = 2 bøder 😇"]]],
];

/** A small deterministic generator, so the demo team is the same team every time. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deletes every demo team and demo player; the counts say what went. */
export async function removeDemoTeam() {
  const stored = await prisma.photo.findMany({ where: { team: { isDemo: true }, storageKey: { not: null } }, select: { storageKey: true } });
  const teams = await prisma.team.deleteMany({ where: { isDemo: true } });
  await removeStored(stored.map((photo) => photo.storageKey));
  const users = await prisma.user.deleteMany({ where: { isDemo: true } });
  return { teams: teams.count, users: users.count };
}

/**
 * `password` is what the demo players log in with; without one they get a random one that
 * nobody knows, so nobody can log in as them (what production wants). `joinUserId` is made
 * admin of the team and moved onto it, so whoever pressed the button lands in it.
 */
export async function createDemoTeam(options: { password?: string; joinUserId?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  await removeDemoTeam();

  const random = seeded(2802);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const sample = <T,>(list: readonly T[], count: number) => {
    const rest = [...list];
    const out: T[] = [];
    while (out.length < count && rest.length) out.push(rest.splice(Math.floor(random() * rest.length), 1)[0]!);
    return out;
  };
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  // Roughly the Danish clock: good enough for made-up kick-off times.
  const day = (offset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(hour - 1, minute, 0, 0);
    return d;
  };

  const team = await prisma.team.create({ data: { name: DEMO_TEAM_NAME, finePriceKr: 10, isDemo: true } });
  const teamId = team.id;

  // --- People ---------------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(options.password ?? randomBytes(32).toString("base64url"), 10);
  const firstName = (name: string) => name.split(" ")[0]!;
  const made = await prisma.user.createManyAndReturn({
    data: PEOPLE.map(([name]) => ({ email: `${firstName(name).toLowerCase()}${DEMO_EMAIL_DOMAIN}`, name, passwordHash, isDemo: true, activeTeamId: teamId })),
    select: { id: true, name: true },
  });
  type Person = (typeof made)[number];
  const byFirstName = new Map(made.map((user) => [firstName(user.name), user]));
  const who = (first: string): Person => {
    const user = byFirstName.get(first);
    if (!user) throw new Error(`No demo player called ${first}`);
    return user;
  };
  const everybody = PEOPLE.map(([name]) => who(firstName(name)));
  /** Those who play and take jobs: everybody but the coach. */
  const squad = everybody.slice(0, -1);
  const [mads, jonas, frederik, oliver, emil, lucas, victor, noah] = squad as [Person, Person, Person, Person, Person, Person, Person, Person];
  await prisma.teamMember.createMany({
    data: PEOPLE.map(([name, role, shirtNumber]) => ({
      teamId, userId: who(firstName(name)).id, role, shirtNumber, takesTasks: shirtNumber !== null, createdAt: ago(120),
    })),
  });
  if (options.joinUserId) {
    await prisma.teamMember.create({ data: { teamId, userId: options.joinUserId, role: "ADMIN" } });
    await prisma.user.update({ where: { id: options.joinUserId }, data: { activeTeamId: teamId } });
  }

  // --- Catalogue and standard jobs --------------------------------------------------------
  const types = await prisma.fineType.createManyAndReturn({
    data: [
      ...FINE_TYPES.map(([name, units]) => ({ teamId, name, units, createdAt: ago(120) })),
      { teamId, name: "Bold over hegnet", units: 3, createdAt: ago(120), archivedAt: ago(60) },
    ],
  });
  const typeByName = new Map(types.map((type) => [type.name, type]));
  await prisma.taskTemplate.createMany({
    data: [
      { teamId, title: "Trøjevask", people: 1 },
      { teamId, title: "Medbring frugt", people: 1 },
      { teamId, title: "Kørsel", people: 2 },
      { teamId, title: "Opkridtning", people: 2, autoAdd: false },
    ],
  });

  // --- The calendar, through the real import ----------------------------------------------
  const event = (uid: string, summary: string, startsAt: Date, location: string | null = null, description: string | null = null, cancelled = false) => ({
    uid, summary, startsAt, endsAt: null, location, description, categories: [], cancelled,
  });
  const fixture = (opponent: string, home: boolean) => (home ? `${DEMO_TEAM_NAME} - ${opponent}` : `${opponent} - ${DEMO_TEAM_NAME}`);
  const played = PLAYED.map(([opponent, home], index) => ({
    uid: `kamp-${index}`, opponent, home, startsAt: day(-5 - 7 * index, [13, 15, 12, 14][index % 4]!),
  }));
  const trained = Array.from({ length: PAST_TRAININGS }, (_, index) => ({ uid: `traening-${index}`, startsAt: day(-2 - 7 * index, 18) }));
  // What has been first, so the jobs done at those matches count when the coming ones are handed out.
  await applyCalendar(
    teamId,
    DEMO_TEAM_NAME,
    [
      ...played.map((m) => event(m.uid, fixture(m.opponent, m.home), m.startsAt, m.home ? HOME_GROUND : `Udebane, ${m.opponent}`)),
      ...trained.map((t) => event(t.uid, "Træning", t.startsAt, "Bane 3")),
    ],
    mads.id,
    now,
  );
  const past = await prisma.match.findMany({ where: { teamId }, select: { id: true, externalUid: true } });
  const activityId = (uid: string) => past.find((row) => row.externalUid === uid)!.id;

  // The standard jobs of the matches played, taken in turn and done — except the kit after
  // the latest match, which is still waiting to be washed.
  let turn = 0;
  const nextUp = () => squad[turn++ % squad.length]!;
  const doneJobs: (Prisma.TaskCreateManyInput & { hands: Person[] })[] = [];
  for (const [index, match] of [...played.entries()].reverse()) {
    const matchId = activityId(match.uid);
    const jobs: [string, number][] = [["Trøjevask", 1], ["Medbring frugt", 1], ...(match.home ? [] : [["Kørsel", 2] as [string, number]])];
    for (const [title, people] of jobs) {
      const hands = Array.from({ length: people }, nextUp);
      const waiting = index === 0 && title === "Trøjevask";
      doneJobs.push({
        teamId, title, matchId, dueAt: match.startsAt, createdAt: new Date(match.startsAt.getTime() - 7 * DAY_MS),
        doneAt: waiting ? null : new Date(match.startsAt.getTime() + 3 * 3_600_000), doneById: waiting ? null : hands[0]!.id, hands,
      });
    }
  }
  const jobRows = await prisma.task.createManyAndReturn({
    data: doneJobs.map((job) => ({ ...job, hands: undefined })),
    select: { id: true, title: true, matchId: true },
  });
  await prisma.taskAssignee.createMany({
    data: doneJobs.flatMap((job) => {
      const row = jobRows.find((r) => r.matchId === job.matchId && r.title === job.title)!;
      return job.hands.map((hand) => ({ taskId: row.id, userId: hand.id, createdAt: job.createdAt }));
    }),
  });

  // What is to come: the import hands the standard jobs out itself, fewest so far first.
  await applyCalendar(
    teamId,
    DEMO_TEAM_NAME,
    [
      ...COMING.map(([opponent, home, offset, hour, minute, location, note], index) =>
        event(`kommende-kamp-${index}`, fixture(opponent, home), day(offset, hour, minute), location, note)),
      ...Array.from({ length: COMING_TRAININGS }, (_, index) =>
        // One of them is off: the import shows it as cancelled.
        event(`kommende-traening-${index}`, "Træning", day(2 + 7 * index, 18), "Bane 3", index === 1 ? "Banen er lukket" : null, index === 1)),
    ],
    mads.id,
    now,
  );

  // --- Fines ------------------------------------------------------------------------------
  const resetAt = ago(RESET_DAYS);
  const lucasResetAt = ago(1);
  const fines: Prisma.FineCreateManyInput[] = [];
  const give = (player: Person, typeName: string, at: Date, extra: { matchId?: string; issuer?: Person; note?: string } = {}) => {
    const type = typeByName.get(typeName)!;
    fines.push({
      teamId, playerId: player.id, fineTypeId: type.id, reason: type.name, units: type.units, unitPriceKr: 10,
      issuedById: (extra.issuer ?? jonas).id, matchId: extra.matchId, note: extra.note, createdAt: at,
      // The treasurer reset everybody after the dinner, and Lucas again yesterday.
      clearedAt: at < resetAt ? resetAt : player.id === lucas.id ? lucasResetAt : null,
    });
  };
  const sprinkle = (activity: { uid: string; startsAt: Date }, count: number, typeNames: readonly string[]) => {
    for (const player of sample(squad, count)) {
      const roll = random();
      const issuer = roll < 0.6 ? jonas : roll < 0.8 ? mads : pick(squad);
      give(player, pick(typeNames), new Date(activity.startsAt.getTime() + 2 * 3_600_000), {
        matchId: activityId(activity.uid),
        issuer: issuer.id === player.id ? mads : issuer,
        note: random() < 0.15 ? pick(FINE_NOTES) : undefined,
      });
    }
  };
  for (const match of played) sprinkle(match, 3 + Math.floor(random() * 3), MATCH_FINES);
  for (const training of trained) sprinkle(training, 1 + Math.floor(random() * 3), TRAINING_FINES);
  const lastMatch = activityId("kamp-0");
  give(oliver, "For sent til træning", ago(1));
  give(oliver, "Gult kort (brok)", ago(5), { matchId: lastMatch });
  give(oliver, "Mobil i omklædningsrummet", ago(12));
  give(emil, "Glemt udstyr", ago(3));
  give(frederik, "For sent til kamp", ago(5), { matchId: lastMatch });
  give(noah, "Mobil i omklædningsrummet", ago(8));
  give(lucas, "Afbud efter deadline", ago(10));
  give(victor, "Rødt kort", ago(19), { matchId: activityId("kamp-2"), note: "To gule på fem minutter" });
  give(who("Magnus"), "Glemt udstyr", ago(4), { issuer: mads });
  give(who("Kasper"), "For sent til træning", ago(9));
  give(who("William"), "Udeblevet uden afbud", ago(16), { issuer: who("Henrik"), note: "Sov over sig – til en aftentræning" });
  await prisma.fine.createMany({ data: fines });

  // --- Challenges ---------------------------------------------------------------------------
  // Each is reported and then approved the way the app does it, so the stake really moves.
  const report = (reporter: Person, winner: Person, loser: Person, description: string, units: number, daysAgo: number, matchId?: string) =>
    prisma.challenge.create({
      data: { teamId, reportedById: reporter.id, winnerId: winner.id, loserId: loser.id, description, units, matchId, createdAt: ago(daysAgo) },
    });
  const approved: [Person, Person, Person, string, number, number, Person, string?][] = [
    [frederik, frederik, noah, "Straffesparkskonkurrence", 3, 4.9, jonas, lastMatch],
    [emil, oliver, emil, "Flest jongleringer i træk", 2, 9, mads],
    [who("William"), who("Magnus"), who("William"), "Hurtigst på 100 meter", 2, 3.5, who("Henrik")],
    [noah, noah, victor, "Bordtennis i klubhuset", 3, 2.5, jonas],
    [who("Rasmus"), who("Kasper"), who("Rasmus"), "Ramme overliggeren fra midten", 1, 8, mads],
  ];
  for (const [reporter, winner, loser, description, units, daysAgo, approver, matchId] of approved) {
    const challenge = await report(reporter, winner, loser, description, units, daysAgo, matchId);
    await settleChallenge(challenge.id, approver.id, ago(daysAgo - 0.4));
  }
  await report(oliver, oliver, mads, "Første til at ramme overliggeren", 3, 0.5);
  await report(victor, emil, victor, "Flest kropsfinter til træning", 2, 2);
  await report(who("Anton"), who("Anton"), who("Sebastian"), "Flest mål til træning", 2, 1.5);
  const withdrawn = await report(who("Tobias"), who("Nikolaj"), who("Tobias"), "Armlægning i omklædningsrummet", 5, 6);
  await prisma.challenge.update({ where: { id: withdrawn.id }, data: { status: "CANCELLED" } });

  // --- Activities made by hand, with sign-ups and jobs of their own ---------------------------
  const handMade = await prisma.match.createManyAndReturn({
    data: [
      { teamId, kind: "OTHER", title: "Fællesspisning", startsAt: day(-41, 18, 30), location: "Pizzeria Valby", source: "MANUAL" },
      { teamId, kind: "OTHER", title: "Klubdag", startsAt: day(16, 10), location: "Valby Idrætspark", note: "Hele klubben samles – vi står for grillen.", source: "MANUAL" },
      { teamId, kind: "OTHER", title: "Afslutningsfest", startsAt: day(48, 19), location: "Klubhuset", note: "Mad, pokaler og årets bødekonge.", source: "MANUAL" },
    ],
    select: { id: true, title: true },
  });
  const handMadeId = (title: string) => handMade.find((row) => row.title === title)!.id;
  const [dinner, clubDay, party] = [handMadeId("Fællesspisning"), handMadeId("Klubdag"), handMadeId("Afslutningsfest")];
  const answers = (matchId: string, coming: number, staysHome: number) =>
    sample(everybody, coming + staysHome).map((user, index) => ({ teamId, matchId, userId: user.id, going: index < coming }));
  await prisma.activitySignup.createMany({ data: [...answers(dinner, 12, 4), ...answers(clubDay, 6, 2), ...answers(party, 11, 3)] });
  const own: [string, string | null, string, Date, Person, Person[], Date | null][] = [
    ["Bestil bord", null, dinner, day(-45, 12), mads, [mads], day(-46, 20)],
    ["Bemand grillen", "To timer fra kl. 11", clubDay, day(16, 10), who("Henrik"), [who("Nikolaj"), who("Malthe")], null],
    ["Bestil holdfest-lokale", "Ring til klubhuset", party, day(9, 23), mads, [mads], null],
    ["Køb ind til festen", null, party, day(47, 23), jonas, [], null],
    ["Lav playliste", null, party, day(48, 19), jonas, [emil], ago(2)],
    ["Indgravér pokaler", "Årets spiller, topscorer og bødekonge", party, day(40, 23), mads, [who("Anton")], null],
  ];
  for (const [title, description, matchId, dueAt, creator, hands, doneAt] of own) {
    await prisma.task.create({
      data: {
        teamId, title, description, matchId, dueAt, createdById: creator.id, doneAt, doneById: doneAt ? (hands[0] ?? creator).id : null,
        assignees: { create: hands.map((hand) => ({ userId: hand.id })) },
      },
    });
  }

  // --- Pictures -----------------------------------------------------------------------------
  let scene = 0;
  const picture = async () => {
    const { full, thumb } = demoPicture(scene++);
    const stored = await storePhoto(teamId, full, thumb);
    if (!stored.ok) throw new Error(stored.error);
    return stored.id;
  };

  // --- Chat ---------------------------------------------------------------------------------
  const messages: Prisma.ChatMessageCreateManyInput[] = [];
  for (const [daysAgo, hour, minute, author, body] of CHAT) {
    messages.push({ teamId, authorId: who(author).id, body, createdAt: day(-daysAgo, hour, minute), photoId: CHAT_PICTURES.includes(body) ? await picture() : null });
  }
  for (const [index, [author, body]] of CHAT_NOW.entries()) {
    messages.push({ teamId, authorId: who(author).id, body, createdAt: new Date(now.getTime() - (CHAT_NOW.length - index) * 600_000) });
  }
  await prisma.chatMessage.createMany({ data: messages });

  // --- Feed: posts, pictures, likes and comments ----------------------------------------------
  const posts = await prisma.post.createManyAndReturn({
    data: POSTS.map(([daysAgo, author, body]) => ({ teamId, authorId: who(author).id, body, createdAt: ago(daysAgo) })),
    select: { id: true, body: true, createdAt: true },
  });
  const postPhotos: Prisma.PostPhotoCreateManyInput[] = [];
  const comments: Prisma.PostCommentCreateManyInput[] = [];
  const likes: Prisma.PostLikeCreateManyInput[] = [];
  const liked = (postId: string, at: Date) => {
    for (const user of sample(everybody, 3 + Math.floor(random() * 10))) {
      likes.push({ postId, userId: user.id, createdAt: new Date(at.getTime() + Math.floor(random() * 20) * 3_600_000) });
    }
  };
  for (const [, , body, pictures, said] of POSTS) {
    const post = posts.find((row) => row.body === body)!;
    for (let position = 0; position < pictures; position++) postPhotos.push({ postId: post.id, photoId: await picture(), position });
    for (const [index, [author, text]] of said.entries()) {
      comments.push({ postId: post.id, authorId: who(author).id, body: text, createdAt: new Date(post.createdAt.getTime() + (index + 1) * 1_500_000) });
    }
    liked(post.id, post.createdAt);
  }

  // --- Polls --------------------------------------------------------------------------------
  type Choice = { text: string; playerId?: string };
  const ask = async (author: Person, daysAgo: number, body: string | null, poll: Omit<Prisma.PollUncheckedCreateWithoutPostInput, "teamId" | "options">, choices: Choice[]) => {
    const post = await prisma.post.create({
      data: {
        teamId, authorId: author.id, body, createdAt: ago(daysAgo),
        poll: { create: { ...poll, teamId, createdAt: ago(daysAgo), options: { create: choices.map((choice, position) => ({ ...choice, position })) } } },
      },
      include: { poll: { include: { options: { orderBy: { position: "asc" } } } } },
    });
    liked(post.id, post.createdAt);
    return post.poll!;
  };
  type Asked = Awaited<ReturnType<typeof ask>>;
  const ballots: Prisma.PollBallotCreateManyInput[] = [];
  const votes: Prisma.PollVoteCreateManyInput[] = [];
  /** Votes with names on: each voter and the option he chose. */
  const named = (poll: Asked, voters: Person[], choose: (voter: Person) => number) => {
    for (const voter of voters) {
      ballots.push({ pollId: poll.id, userId: voter.id });
      votes.push({ pollId: poll.id, optionId: poll.options[choose(voter)]!.id, voterId: voter.id });
    }
  };
  /**
   * An anonymous poll: who voted, and how many votes each answer has — written as two
   * separate things, with nothing in between that says who chose what.
   */
  const secret = (poll: Asked, voters: Person[], tally: number[]) => {
    for (const voter of voters) ballots.push({ pollId: poll.id, userId: voter.id });
    for (const [index, count] of tally.entries()) {
      for (let n = 0; n < count; n++) votes.push({ pollId: poll.id, optionId: poll.options[index]!.id, voterId: null });
    }
  };
  /** Kampens spiller: fourteen played, and the votes lean towards whoever had the day. */
  const playerOfTheMatch = async (matchIndex: number, daysAgo: number, body: string, hero: Person, voters: number, closed: boolean) => {
    const lineUp = [hero, ...sample(squad.filter((p) => p.id !== hero.id), 13)].sort((a, b) => squad.indexOf(a) - squad.indexOf(b));
    const poll = await ask(mads, daysAgo, body, { question: "Kampens spiller", matchId: activityId(`kamp-${matchIndex}`), closedAt: closed ? ago(daysAgo - 3) : null }, lineUp.map((p) => ({ text: p.name, playerId: p.id })));
    named(poll, sample(everybody, voters), () => (random() < 0.55 ? lineUp.indexOf(hero) : Math.floor(random() * lineUp.length)));
  };
  await playerOfTheMatch(2, 18.5, "Hvem var bedst i Husum? (Ja, der skal findes en.)", who("Anton"), 10, true);
  await playerOfTheMatch(1, 11.5, "Kampens spiller mod Brønshøj?", emil, 12, true);
  await playerOfTheMatch(0, 4.5, "Stem på kampens spiller fra sejren over Hvidovre 🏆", frederik, 9, false);

  const camp = await ask(who("Henrik"), 26, "Vi overvejer en træningslejr til foråret. Hvad siger I?", { question: "Træningslejr til foråret?", anonymous: true, closedAt: ago(20) }, [{ text: "Ja, jeg er med" }, { text: "Måske" }, { text: "Nej tak" }]);
  secret(camp, sample(everybody, 15), [9, 4, 2]);
  const shirt = await ask(jonas, 7, "Vi skal bestille ny udebanetrøje. Flertallet bestemmer.", { question: "Hvilken farve?" }, [{ text: "Sort" }, { text: "Hvid" }, { text: "Orange" }]);
  named(shirt, sample(everybody, 11), () => (random() < 0.5 ? 0 : random() < 0.6 ? 2 : 1));
  const partyDate = await ask(jonas, 3, null, { question: "Hvornår skal vi holde fest?", anonymous: true, multipleChoice: true }, [{ text: "Fredag om to uger" }, { text: "Lørdag om to uger" }, { text: "Lørdag om tre uger" }]);
  secret(partyDate, sample(everybody, 10), [4, 8, 5]);

  await prisma.postPhoto.createMany({ data: postPhotos });
  await prisma.postComment.createMany({ data: comments });
  await prisma.postLike.createMany({ data: likes });
  await prisma.pollBallot.createMany({ data: ballots });
  await prisma.pollVote.createMany({ data: votes });

  return team;
}
