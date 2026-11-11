import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { attemptsAllowed, checkRateLimit, clearAttempts, recordFailedAttempt } from "@/lib/rate-limit";
import { headerStore } from "../helpers/next-mocks";

describe("rate limits", () => {
  it("allow eight guesses at a secret, sixty pictures and 120 chat messages", () => {
    expect([attemptsAllowed("login"), attemptsAllowed("invite"), attemptsAllowed("photo"), attemptsAllowed("chat")]).toEqual([8, 8, 60, 120]);
  });

  it("store only a hash, never the address or the email", async () => {
    await recordFailedAttempt("login", "Anna@Test.dk");
    const [row] = await prisma.loginAttempt.findMany();
    expect(row!.key).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.key).not.toContain("anna");
  });

  it("count the same person however the email is cased, and forget on success", async () => {
    for (let i = 0; i < 8; i++) await recordFailedAttempt("login", i % 2 ? "ANNA@test.dk" : " anna@test.dk ");
    expect(await checkRateLimit("login", "anna@test.dk")).toMatchObject({ allowed: false, retryAfterMinutes: 15 });
    expect(await checkRateLimit("invite", "anna@test.dk")).toEqual({ allowed: true });
    await clearAttempts("login", "anna@test.dk");
    expect(await checkRateLimit("login", "anna@test.dk")).toEqual({ allowed: true });
  });

  it("key on Vercel's own header before one the caller can write", async () => {
    headerStore.set("x-vercel-forwarded-for", "198.51.100.1");
    for (let i = 0; i < 8; i++) {
      // A caller varying x-forwarded-for does not get a fresh bucket each time.
      headerStore.set("x-forwarded-for", `203.0.113.${i}`);
      await recordFailedAttempt("login", "anna@test.dk");
    }
    expect((await checkRateLimit("login", "anna@test.dk")).allowed).toBe(false);
    headerStore.set("x-vercel-forwarded-for", "198.51.100.2");
    expect((await checkRateLimit("login", "anna@test.dk")).allowed).toBe(true);
  });

  it("let attempts older than a quarter of an hour fall away", async () => {
    await recordFailedAttempt("login", "anna@test.dk");
    const key = (await prisma.loginAttempt.findFirstOrThrow()).key;
    await prisma.loginAttempt.createMany({ data: Array.from({ length: 8 }, () => ({ key, createdAt: new Date(Date.now() - 16 * 60 * 1000) })) });
    expect((await checkRateLimit("login", "anna@test.dk")).allowed).toBe(true);
    await recordFailedAttempt("login", "anna@test.dk");
    expect(await prisma.loginAttempt.count()).toBe(2);
  });
});
