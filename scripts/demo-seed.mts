/**
 * A team worth looking at, for screenshots and trying things out locally:
 * `npm run db:demo`. Makes (or remakes) the team "Swingkings Demo" (`src/lib/demo-team.ts`).
 * Password for everybody: demo-password. `npm run db:demo -- --remove` takes it away again.
 * Refuses a database that is not on this machine; in production the super admin uses
 * "Opret testhold" on /admin, whose players nobody can log in as.
 */
import { config } from "dotenv";

config({ quiet: true });
const host = new URL(process.env.DATABASE_URL ?? "").hostname;
if (!["localhost", "127.0.0.1"].includes(host)) throw new Error(`Refusing to seed demo data into ${host}`);

const { prisma } = await import("../src/lib/prisma");
const { createDemoTeam, removeDemoTeam, DEMO_TEAM_NAME } = await import("../src/lib/demo-team");

if (process.argv.includes("--remove")) {
  const gone = await removeDemoTeam();
  console.log(`Removed ${gone.teams} demo team(s) and ${gone.users} demo player(s).`);
} else {
  await createDemoTeam({ password: "demo-password" });
  console.log(`Demo team "${DEMO_TEAM_NAME}" ready. Log in as mads@demo.swingkings.dk (admin), jonas@ (kasserer) or oliver@ — password demo-password.`);
}
await prisma.$disconnect();
