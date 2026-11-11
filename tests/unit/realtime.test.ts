import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BROADCAST_TIMEOUT_MS, TOKEN_TTL_SECONDS, broadcast, realtimeConfig, realtimeToken } from "@/lib/realtime";
import { CHAT_POSTED, teamTopic } from "@/lib/realtime-topic";

const env = {
  SUPABASE_URL: " https://x.supabase.co// ",
  SUPABASE_PUBLISHABLE_KEY: "pub",
  SUPABASE_SECRET_KEY: "sec",
  SUPABASE_JWT_SECRET: "jwt",
};

afterEach(() => vi.unstubAllGlobals());

describe("realtimeConfig", () => {
  it("takes all four settings, tidied", () => {
    expect(realtimeConfig(env)).toEqual({ url: "https://x.supabase.co", publishableKey: "pub", secretKey: "sec", jwtSecret: "jwt" });
  });

  it("is off unless all four are there", () => {
    for (const key of Object.keys(env)) expect(realtimeConfig({ ...env, [key]: " " }), key).toBeNull();
    expect(realtimeConfig({})).toBeNull();
  });
});

describe("realtimeToken", () => {
  it("is a short HS256 token naming the user and their teams, signed with the JWT secret", () => {
    const config = realtimeConfig(env)!;
    const now = new Date("2026-11-11T10:00:00Z");
    const { token, expiresAt } = realtimeToken(config, "user-1", ["a", "b"], now);
    const [header, payload, signature] = token.split(".");
    const read = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
    expect(read(header!)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(read(payload!)).toEqual({
      sub: "user-1",
      role: "authenticated",
      aud: "authenticated",
      iat: now.getTime() / 1000,
      exp: now.getTime() / 1000 + TOKEN_TTL_SECONDS,
      teams: ["a", "b"],
    });
    expect(expiresAt).toBe(now.getTime() / 1000 + TOKEN_TTL_SECONDS);
    expect(signature).toBe(createHmac("sha256", "jwt").update(`${header}.${payload}`).digest("base64url"));
  });
});

describe("broadcast", () => {
  it("sends a private nudge with an empty payload and the secret key", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    await broadcast(realtimeConfig(env)!, "team-1", CHAT_POSTED);
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/realtime/v1/api/broadcast");
    expect(init.headers).toMatchObject({ apikey: "sec" });
    expect(JSON.parse(init.body as string)).toEqual({ messages: [{ topic: "team:team-1", event: "chat-posted", payload: {}, private: true }] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(BROADCAST_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("logs and swallows a failure, so a chat message is never lost to Supabase", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response(null, { status: 500 }));
    await expect(broadcast(realtimeConfig(env)!, "t", "e")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", async () => {
      throw new Error("down");
    });
    await expect(broadcast(realtimeConfig(env)!, "t", "e")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});

describe("teamTopic", () => {
  it("is one private channel per team", () => {
    expect(teamTopic("abc")).toBe("team:abc");
  });
});
