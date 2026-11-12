import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** A query slower than this is written to the log (Vercel keeps it for an hour). */
const SLOW_QUERY_MS = 100;

function createClient() {
  const timing = process.env.NODE_ENV === "production";
  const client = new PrismaClient(timing ? { log: [{ emit: "event", level: "query" }] } : undefined);
  if (!timing) return client;

  // How long a fresh server takes to reach the database: paid by whoever opens the app
  // first after a quiet spell. Only durations and table names are logged — never the
  // query's values, so nothing a person entered (or how they voted) reaches the log.
  const started = performance.now();
  client
    .$connect()
    .then(() => console.log(`[timing] cold start: database connected in ${Math.round(performance.now() - started)} ms`))
    .catch(() => {});
  client.$on("query", (event) => {
    if (event.duration < SLOW_QUERY_MS) return;
    const table = /FROM "public"\."(\w+)"/.exec(event.query)?.[1] ?? "?";
    console.log(`[timing] slow query: ${table} ${event.duration} ms`);
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
