import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Creates the first super admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD, and —
 * when there are no teams yet — the team itself with them as its admin and a starter
 * fine catalogue and standard match jobs, so the app is usable from the first login.
 * Safe to run twice: nothing that exists is changed.
 */
const prisma = new PrismaClient();

const STARTER_FINES = [
  { name: "For sent til træning", units: 2 },
  { name: "For sent til kamp", units: 5 },
  { name: "Glemt udstyr", units: 2 },
  { name: "Afbud efter deadline", units: 5 },
  { name: "Gult kort (brok)", units: 5 },
  { name: "Rødt kort", units: 15 },
  { name: "Mobil i omklædningsrummet", units: 1 },
  { name: "Brændt straffespark", units: 3 },
];

const STARTER_JOBS = [
  { title: "Vask spilletøj", people: 1 },
  { title: "Medbring frugt", people: 1 },
  { title: "Kørsel til udekamp", people: 2 },
];

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD");

  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: {
        email,
        name: process.env.SUPER_ADMIN_NAME?.trim() || "Admin",
        passwordHash: await bcrypt.hash(password, 10),
        role: "SUPER_ADMIN",
      },
    }));

  if ((await prisma.team.count()) === 0) {
    const team = await prisma.team.create({
      data: {
        name: "Swingkings",
        members: { create: { userId: user.id, role: "ADMIN" } },
        fineTypes: { create: STARTER_FINES },
        taskTemplates: { create: STARTER_JOBS },
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: team.id } });
    console.log(`Created team ${team.name} with ${email} as admin.`);
  }
  console.log(`Super admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
