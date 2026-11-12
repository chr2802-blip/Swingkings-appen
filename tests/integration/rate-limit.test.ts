import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { attemptWindowMs, attemptsAllowed, checkRateLimit, clearAttempts, recordAttempt, takeAttempt } from "@/lib/rate-limit";
import { headerStore } from "../helpers/next-mocks";

describe("rate limits", () => {
  it("allow eight guesses at a secret, sixty pictures, 120 chat messages and a club's sign-ups", () => {
    expect([attemptsAllowed("login"), attemptsAllowed("join"), attemptsAllowed("photo"), attemptsAllowed("chat")]).toEqual([8, 8, 60, 120]);
    expect([attemptsAllowed("signup"), attemptsAllowed("join-link")]).toEqual([15, 30]);
    expect([attemptWindowMs("login"), attemptWindowMs("signup"), attemptWindowMs("join-link")]).toEqual([15 * 60_000, 3_600_000, 3_600_000]);
  });

  it("count before they answer when limiting how much is made, so a burst cannot slip under", async () => {
    const burst = await Promise.all(Array.from({ length: 20 }, () => takeAttempt("signup", "")));
    expect(burst.filter((r) => r.allowed).length).toBeLessThanOrEqual(15);
    await prisma.loginAttempt.deleteMany();
    for (let i = 0; i < 15; i++) expect(await takeAttempt("signup", "")).toEqual({ allowed: true });
    expect(await takeAttempt("signup", "")).toMatchObject({ allowed: false, retryAfterMinutes: 60 });
  });

  it("store only a hash, never the address or the email", async () => {
    await recordAttempt("login", "Anna@Test.dk");
    const [row] = await prisma.loginAttempt.findMany();
    expect(row!.key).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.key).not.toContain("anna");
  });

  it("count the same person however the email is cased, and forget on success", async () => {
    for (let i = 0; i < 8; i++) await recordAttempt("login", i % 2 ? "ANNA@test.dk" : " anna@test.dk ");
    expect(await checkRateLimit("login", "anna@test.dk")).toMatchObject({ allowed: false, retryAfterMinutes: 15 });
    expect(await checkRateLimit("join", "anna@test.dk")).toEqual({ allowed: true });
    await clearAttempts("login", "anna@test.dk");
    expect(await checkRateLimit("login", "anna@test.dk")).toEqual({ allowed: true });
  });

  it("key on Vercel's own header before one the caller can write", async () => {
    headerStore.set("x-vercel-forwarded-for", "198.51.100.1");
    for (let i = 0; i < 8; i++) {
      // A caller varying x-forwarded-for does not get a fresh bucket each time.
      headerStore.set("x-forwarded-for", `203.0.113.${i}`);
      await recordAttempt("login", "anna@test.dk");
    }
    expect((await checkRateLimit("login", "anna@test.dk")).allowed).toBe(false);
    headerStore.set("x-vercel-forwarded-for", "198.51.100.2");
    expect((await checkRateLimit("login", "anna@test.dk")).allowed).toBe(true);
  });

  it("let attempts older than a quarter of an hour fall away", async () => {
    await recordAttempt("login", "anna@test.dk");
    const key = (await prisma.loginAttempt.findFirstOrThrow()).key;
    await prisma.loginAttempt.createMany({ data: Array.from({ length: 8 }, () => ({ key, createdAt: new Date(Date.now() - 16 * 60 * 1000) })) });
    expect((await checkRateLimit("login", "anna@test.dk")).allowed).toBe(true);
    // Swept only once older than the longest window (an hour), so a sign-up limit still sees them.
    await prisma.loginAttempt.create({ data: { key, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    await recordAttempt("login", "anna@test.dk");
    expect(await prisma.loginAttempt.count({ where: { createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } })).toBe(0);
    expect(await prisma.loginAttempt.count()).toBe(10);
  });
});
