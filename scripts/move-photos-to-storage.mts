/**
 * Moves pictures from Postgres to Supabase Storage: `npm run db:photos`. Safe to run again
 * and to stop half-way — each picture is copied first and its row changed after, so a
 * picture is always in one place or the other. Reads `DATABASE_URL`, `SUPABASE_URL` and
 * `SUPABASE_SECRET_KEY` from `.env` or the environment; point them at production to move
 * production. `--dry-run` only counts.
 */
import { config } from "dotenv";

config({ quiet: true });
const { prisma } = await import("../src/lib/prisma");
const { fullKey, putObject, storageConfig, thumbKey } = await import("../src/lib/storage");

const storage = storageConfig();
if (!storage) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first.");
const dryRun = process.argv.includes("--dry-run");

const where = { storageKey: null, bytes: { not: null }, thumbBytes: { not: null } } as const;
const total = await prisma.photo.count({ where });
console.log(`${total} picture(s) still in Postgres.`);

let moved = 0;
while (!dryRun) {
  // Small batches: each row carries up to a megabyte and a half.
  const batch = await prisma.photo.findMany({ where, take: 10, orderBy: { createdAt: "asc" } });
  if (batch.length === 0) break;
  for (const photo of batch) {
    const key = `${photo.teamId}/${photo.id}`;
    await putObject(storage, fullKey(key), photo.bytes!, photo.contentType);
    await putObject(storage, thumbKey(key), photo.thumbBytes!, photo.contentType);
    // Guarded: a row somebody else moved or changed in the meantime is left as it is.
    await prisma.photo.updateMany({ where: { id: photo.id, storageKey: null }, data: { storageKey: key, bytes: null, thumbBytes: null } });
    moved++;
  }
  console.log(`Moved ${moved} of ${total}.`);
}
await prisma.$disconnect();
