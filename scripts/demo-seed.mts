/**
 * A team worth looking at, for screenshots and trying things out locally:
 * `npm run db:demo`. Makes (or remakes) the team "Swingkings Demo" with eight players,
 * a fine catalogue, fines, payments, challenges in every state, a calendar read through
 * the real KampKlar import, tasks, chat and feed. Password for everybody: demo-password.
 * Refuses a database that is not on this machine.
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";

config({ quiet: true });
const host = new URL(process.env.DATABASE_URL ?? "").hostname;
if (!["localhost", "127.0.0.1"].includes(host)) throw new Error(`Refusing to seed demo data into ${host}`);

const { prisma } = await import("../src/lib/prisma");
const { applyCalendar } = await import("../src/lib/kampklar");
const { settleChallenge } = await import("../src/lib/fines");

const TEAM = "Swingkings Demo";
const old = await prisma.team.findMany({ where: { name: TEAM }, select: { id: true } });
await prisma.team.deleteMany({ where: { id: { in: old.map((t) => t.id) } } });
await prisma.user.deleteMany({ where: { email: { endsWith: "@demo.swingkings.dk" } } });

const team = await prisma.team.create({ data: { name: TEAM, finePriceKr: 10 } });
const passwordHash = await bcrypt.hash("demo-password", 10);
const names = ["Mads Holm", "Jonas Berg", "Frederik Lund", "Oliver Krog", "Emil Dahl", "Lucas Friis", "Victor Bach", "Noah Skov"];
const users = [];
for (const [index, name] of names.entries()) {
  users.push(
    await prisma.user.create({
      data: {
        email: `${name.split(" ")[0]!.toLowerCase()}@demo.swingkings.dk`,
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
const [mads, jonas, frederik, oliver, emil, lucas, victor, noah] = users as [typeof users[number], ...typeof users];

const types = await Promise.all(
  [
    ["For sent til træning", 2],
    ["For sent til kamp", 5],
    ["Glemt udstyr", 2],
    ["Afbud efter deadline", 5],
    ["Gult kort (brok)", 5],
    ["Rødt kort", 15],
    ["Mobil i omklædningsrummet", 1],
  ].map(([name, units]) => prisma.fineType.create({ data: { teamId: team.id, name: String(name), units: Number(units) } })),
);
await prisma.taskTemplate.createMany({
  data: [
    { teamId: team.id, title: "Vask spilletøj", people: 1 },
    { teamId: team.id, title: "Medbring frugt", people: 1 },
    { teamId: team.id, title: "Kørsel", people: 2 },
  ],
});

const day = (offset: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(hour - 2, minute, 0, 0);
  return d;
};
await applyCalendar(
  team.id,
  TEAM,
  [
    { uid: "d1", summary: "Swingkings Demo - B.93", startsAt: day(6, 14, 30), endsAt: null, location: "Kunstgræsbanen, Valby Idrætspark", description: "Mødetid 13:45", categories: [], cancelled: false },
    { uid: "d2", summary: "Træning", startsAt: day(2, 18), endsAt: null, location: "Bane 3", description: null, categories: [], cancelled: false },
    { uid: "d3", summary: "Vanløse IF - Swingkings Demo", startsAt: day(13, 12), endsAt: null, location: "Vanløse Idrætspark", description: null, categories: [], cancelled: false },
    { uid: "d4", summary: "Swingkings Demo - Fremad Amager", startsAt: day(20, 15), endsAt: null, location: null, description: null, categories: [], cancelled: false },
    { uid: "d0", summary: "Hvidovre - Swingkings Demo", startsAt: day(-5, 13), endsAt: null, location: null, description: null, categories: [], cancelled: false },
  ],
  mads.id,
);
const lastMatch = await prisma.match.findFirstOrThrow({ where: { teamId: team.id, externalUid: "d0" } });

const give = (player: typeof mads, type: (typeof types)[number], daysAgo: number, matchId?: string) =>
  prisma.fine.create({
    data: {
      teamId: team.id, playerId: player.id, fineTypeId: type.id, reason: type.name, units: type.units, unitPriceKr: 10,
      issuedById: jonas.id, matchId, createdAt: new Date(Date.now() - daysAgo * 86400000),
    },
  });
await give(oliver, types[0]!, 1);
await give(oliver, types[4]!, 5, lastMatch.id);
await give(emil, types[2]!, 3);
await give(frederik, types[1]!, 5, lastMatch.id);
await give(noah, types[6]!, 8);
await give(lucas, types[3]!, 10);
await give(oliver, types[6]!, 12);
await prisma.payment.create({ data: { teamId: team.id, playerId: lucas.id, amountKr: 50, note: "MobilePay", recordedById: jonas.id } });
await prisma.payment.create({ data: { teamId: team.id, playerId: noah.id, amountKr: 10, recordedById: jonas.id } });

await prisma.challenge.create({ data: { teamId: team.id, challengerId: oliver.id, opponentId: mads.id, description: "Jeg scorer før dig på lørdag", units: 3 } });
await prisma.challenge.create({ data: { teamId: team.id, challengerId: emil.id, opponentId: victor.id, description: "Flest kropsfinter til træning", units: 2, status: "ACCEPTED", claimedById: emil.id, claimedWinnerId: emil.id } });
const settled = await prisma.challenge.create({ data: { teamId: team.id, challengerId: frederik.id, opponentId: noah.id, description: "Straffesparkskonkurrence", units: 5, status: "ACCEPTED", matchId: lastMatch.id } });
await settleChallenge(settled.id, frederik.id, jonas.id);

await prisma.task.create({
  data: { teamId: team.id, title: "Bestil holdfest-lokale", description: "Ring til klubhuset", dueAt: day(9, 23), createdById: mads.id, assignees: { create: [{ userId: mads.id }] } },
});
await prisma.task.create({ data: { teamId: team.id, title: "Køb nye bolde", dueAt: day(4, 23), createdById: jonas.id } });

const chat = [
  [mads, "Husk mødetid 13:45 på lørdag! 💪"],
  [oliver, "Jeg kommer lidt senere, sidder fast i trafikken 🙈"],
  [jonas, "Så er der bøde 😂"],
  [emil, "Nogen der kan tage mig med til udekampen?"],
  [victor, "Jeg har to pladser"],
] as const;
for (const [index, [author, body]] of chat.entries()) {
  await prisma.chatMessage.create({ data: { teamId: team.id, authorId: author.id, body, createdAt: new Date(Date.now() - (chat.length - index) * 600000) } });
}
const post = await prisma.post.create({ data: { teamId: team.id, authorId: frederik.id, body: "Sejr 3-1 over Hvidovre! Hvilken kamp 🔥" } });
await prisma.postLike.createMany({ data: [mads, oliver, emil].map((u) => ({ postId: post.id, userId: u.id })) });
await prisma.postComment.create({ data: { postId: post.id, authorId: oliver.id, body: "Det mål i 89. minut 🤩" } });

console.log(`Demo team "${TEAM}" ready. Log in as mads@demo.swingkings.dk (admin), jonas@ (kasserer) or oliver@ — password demo-password.`);
await prisma.$disconnect();
