import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { applyCalendar } from "./kampklar";
import { settleChallenge } from "./fines";

/**
 * A team worth looking at: "Swingkings Demo" with eight made-up players, a fine catalogue,
 * fines (one player reset), challenges waiting and approved, a calendar read through the real KampKlar
 * import, tasks, chat, feed and polls. Made (or remade) by `npm run db:demo` locally and by
 * the super admin's "Opret testhold" on /admin, and thrown away again by `removeDemoTeam`.
 *
 * Everything it makes is found again by the team's name and the players' addresses, so
 * removing it touches nothing else. Crosses teams on purpose, so `prisma` directly.
 */
export const DEMO_TEAM_NAME = "Swingkings Demo";
export const DEMO_EMAIL_DOMAIN = "@demo.swingkings.dk";

/** Deletes every demo team and demo player; the counts say what went. */
export async function removeDemoTeam() {
  const teams = await prisma.team.deleteMany({ where: { name: DEMO_TEAM_NAME } });
  const users = await prisma.user.deleteMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
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

  const team = await prisma.team.create({ data: { name: DEMO_TEAM_NAME, finePriceKr: 10 } });
  const passwordHash = await bcrypt.hash(options.password ?? randomBytes(32).toString("base64url"), 10);
  const names = ["Mads Holm", "Jonas Berg", "Frederik Lund", "Oliver Krog", "Emil Dahl", "Lucas Friis", "Victor Bach", "Noah Skov"];
  const users = [];
  for (const [index, name] of names.entries()) {
    users.push(
      await prisma.user.create({
        data: {
          email: `${name.split(" ")[0]!.toLowerCase()}${DEMO_EMAIL_DOMAIN}`,
          name,
          passwordHash,
          activeTeamId: team.id,
          memberships: {
            create: { teamId: team.id, role: index === 0 ? "ADMIN" : index === 1 ? "TREASURER" : "PLAYER", shirtNumber: [1, 4, 7, 9, 10, 11, 14, 23][index] },
          },
        },
      }),
    );
  }
  const [mads, jonas, frederik, oliver, emil, lucas, victor, noah] = users as [(typeof users)[number], ...typeof users];

  if (options.joinUserId) {
    await prisma.teamMember.create({ data: { teamId: team.id, userId: options.joinUserId, role: "ADMIN" } });
    await prisma.user.update({ where: { id: options.joinUserId }, data: { activeTeamId: team.id } });
  }

  const types = await Promise.all(
    (
      [
        ["For sent til træning", 2],
        ["For sent til kamp", 5],
        ["Glemt udstyr", 2],
        ["Afbud efter deadline", 5],
        ["Gult kort (brok)", 5],
        ["Rødt kort", 15],
        ["Mobil i omklædningsrummet", 1],
      ] as const
    ).map(([name, units]) => prisma.fineType.create({ data: { teamId: team.id, name, units } })),
  );
  await prisma.taskTemplate.createMany({
    data: [
      { teamId: team.id, title: "Trøjevask", people: 1 },
      { teamId: team.id, title: "Medbring frugt", people: 1 },
      { teamId: team.id, title: "Kørsel", people: 2 },
      { teamId: team.id, title: "Opkridtning", people: 2, autoAdd: false },
    ],
  });

  // Roughly the Danish clock: good enough for made-up kick-off times.
  const day = (offset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(hour - 1, minute, 0, 0);
    return d;
  };
  const event = (uid: string, summary: string, startsAt: Date, location: string | null = null, description: string | null = null) => ({
    uid, summary, startsAt, endsAt: null, location, description, categories: [], cancelled: false,
  });
  await applyCalendar(
    team.id,
    DEMO_TEAM_NAME,
    [
      event("d1", `${DEMO_TEAM_NAME} - B.93`, day(6, 14, 30), "Kunstgræsbanen, Valby Idrætspark", "Mødetid 13:45"),
      event("d2", "Træning", day(2, 18), "Bane 3"),
      event("d3", `Vanløse IF - ${DEMO_TEAM_NAME}`, day(13, 12), "Vanløse Idrætspark"),
      event("d4", `${DEMO_TEAM_NAME} - Fremad Amager`, day(20, 15)),
      event("d0", `Hvidovre - ${DEMO_TEAM_NAME}`, day(-5, 13)),
    ],
    mads.id,
    now,
  );
  const lastMatch = await prisma.match.findFirstOrThrow({ where: { teamId: team.id, externalUid: "d0" } });

  const give = (player: typeof mads, type: (typeof types)[number], daysAgo: number, matchId?: string) =>
    prisma.fine.create({
      data: {
        teamId: team.id, playerId: player.id, fineTypeId: type.id, reason: type.name, units: type.units, unitPriceKr: 10,
        issuedById: jonas.id, matchId, createdAt: new Date(now.getTime() - daysAgo * 86400000),
      },
    });
  await give(oliver, types[0]!, 1);
  await give(oliver, types[4]!, 5, lastMatch.id);
  await give(emil, types[2]!, 3);
  await give(frederik, types[1]!, 5, lastMatch.id);
  await give(noah, types[6]!, 8);
  const lucasFine = await give(lucas, types[3]!, 10);
  // The treasurer has reset Lucas: his fine is history, not owed.
  await prisma.fine.update({ where: { id: lucasFine.id }, data: { clearedAt: new Date(now.getTime() - 2 * 86400000) } });
  await give(oliver, types[6]!, 12);
  const report = (reporter: typeof mads, winner: typeof mads, loser: typeof mads, description: string, units: number, matchId?: string) =>
    prisma.challenge.create({
      data: { teamId: team.id, reportedById: reporter.id, winnerId: winner.id, loserId: loser.id, description, units, matchId },
    });
  await report(oliver, oliver, mads, "Første til at ramme overliggeren", 3);
  await report(victor, emil, victor, "Flest kropsfinter til træning", 2);
  const settled = await report(frederik, frederik, noah, "Straffesparkskonkurrence", 3, lastMatch.id);
  await settleChallenge(settled.id, jonas.id, now);

  const endOfSeason = await prisma.match.create({
    data: { teamId: team.id, kind: "OTHER", title: "Afslutningsfest", startsAt: day(27, 19), location: "Klubhuset", source: "MANUAL" },
  });
  await prisma.task.create({
    data: { teamId: team.id, title: "Bestil holdfest-lokale", description: "Ring til klubhuset", matchId: endOfSeason.id, dueAt: day(9, 23), createdById: mads.id, assignees: { create: [{ userId: mads.id }] } },
  });
  await prisma.activitySignup.createMany({
    data: [
      { teamId: team.id, matchId: endOfSeason.id, userId: mads.id, going: true },
      { teamId: team.id, matchId: endOfSeason.id, userId: jonas.id, going: true },
      { teamId: team.id, matchId: endOfSeason.id, userId: emil.id, going: true },
      { teamId: team.id, matchId: endOfSeason.id, userId: noah.id, going: false },
    ],
  });
  await prisma.task.create({ data: { teamId: team.id, title: "Køb ind til festen", matchId: endOfSeason.id, dueAt: day(26, 23), createdById: jonas.id } });

  const chat = [
    [mads, "Husk mødetid 13:45 på lørdag! 💪"],
    [oliver, "Jeg kommer lidt senere, sidder fast i trafikken 🙈"],
    [jonas, "Så er der bøde 😂"],
    [emil, "Nogen der kan tage mig med til udekampen?"],
    [victor, "Jeg har to pladser"],
  ] as const;
  for (const [index, [author, body]] of chat.entries()) {
    await prisma.chatMessage.create({ data: { teamId: team.id, authorId: author.id, body, createdAt: new Date(now.getTime() - (chat.length - index) * 600000) } });
  }
  const post = await prisma.post.create({ data: { teamId: team.id, authorId: frederik.id, body: "Sejr 3-1 over Hvidovre! Hvilken kamp 🔥" } });
  await prisma.postLike.createMany({ data: [mads, oliver, emil].map((u) => ({ postId: post.id, userId: u.id })) });
  await prisma.postComment.create({ data: { postId: post.id, authorId: oliver.id, body: "Det mål i 89. minut 🤩" } });

  const roster = [mads, jonas, frederik, oliver, emil, lucas, victor, noah];
  const motm = await prisma.post.create({
    data: {
      teamId: team.id,
      authorId: mads.id,
      body: "Stem på kampens spiller fra sejren over Hvidovre 🏆",
      poll: {
        create: {
          teamId: team.id,
          question: "Kampens spiller",
          matchId: lastMatch.id,
          options: { create: roster.map((u, position) => ({ text: u.name, playerId: u.id, position })) },
        },
      },
    },
    include: { poll: { include: { options: true } } },
  });
  const optionFor = (player: (typeof roster)[number]) => motm.poll!.options.find((o) => o.playerId === player.id)!.id;
  for (const [voter, pick] of [[jonas, frederik], [emil, frederik], [victor, noah]] as const) {
    await prisma.pollBallot.create({ data: { pollId: motm.poll!.id, userId: voter.id } });
    await prisma.pollVote.create({ data: { pollId: motm.poll!.id, optionId: optionFor(pick), voterId: voter.id } });
  }
  const party = await prisma.post.create({
    data: {
      teamId: team.id,
      authorId: jonas.id,
      poll: {
        create: {
          teamId: team.id,
          question: "Hvornår skal vi holde fest?",
          anonymous: true,
          multipleChoice: true,
          options: { create: ["Fredag om to uger", "Lørdag om to uger", "Lørdag om tre uger"].map((text, position) => ({ text, position })) },
        },
      },
    },
    include: { poll: { include: { options: true } } },
  });
  const [fri, sat] = party.poll!.options.sort((a, b) => a.position - b.position);
  for (const [voter, choices] of [[mads, [fri!, sat!]], [emil, [sat!]], [lucas, [sat!]]] as const) {
    await prisma.pollBallot.create({ data: { pollId: party.poll!.id, userId: voter.id } });
    // Anonymous: the vote rows carry no voter, only the ballot says who has voted.
    await prisma.pollVote.createMany({ data: choices.map((o) => ({ pollId: party.poll!.id, optionId: o.id, voterId: null })) });
  }

  return team;
}
