import { createHmac } from "node:crypto";
import { after } from "next/server";
import { teamTopic } from "./realtime-topic";

/**
 * The push half of the live chat, through Supabase Realtime's Broadcast.
 *
 * Serverless functions cannot hold a socket open to a phone; Supabase can. A phone with
 * the chat open keeps one websocket to Realtime, and a write here tells Realtime about
 * itself with one HTTP request. **What is sent is a nudge and nothing else** — never the
 * message — and a phone that hears one asks `/api/chat` for what is new, exactly as its
 * timer would. A nudge lost, doubled or spoofed costs one question the poll would have
 * asked anyway.
 *
 * Channels are private, one per team (`team:<teamId>`); a phone joins with a short-lived
 * token signed here naming its owner's teams, and one RLS policy (migration
 * `realtime_team_channels`) lets it read only those. Nothing lets a phone send.
 *
 * All four settings or none: without them the chat simply polls.
 */
export type RealtimeConfig = { url: string; publishableKey: string; secretKey: string; jwtSecret: string };

export function realtimeConfig(env: Record<string, string | undefined> = process.env): RealtimeConfig | null {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  const jwtSecret = env.SUPABASE_JWT_SECRET?.trim();
  if (!url || !publishableKey || !secretKey || !jwtSecret) return null;
  return { url, publishableKey, secretKey, jwtSecret };
}

/** Short, so somebody removed from a team stops hearing nudges within this. */
export const TOKEN_TTL_SECONDS = 15 * 60;

export function realtimeToken(config: RealtimeConfig, userId: string, teamIds: string[], now: Date = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iat: issuedAt,
    exp: expiresAt,
    teams: teamIds,
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const body = `${b64(header)}.${b64(payload)}`;
  const signature = createHmac("sha256", config.jwtSecret).update(body).digest("base64url");
  return { token: `${body}.${signature}`, expiresAt };
}

export const BROADCAST_TIMEOUT_MS = 3000;

export async function broadcast(config: RealtimeConfig, teamId: string, event: string): Promise<void> {
  try {
    const response = await fetch(`${config.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: config.secretKey, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: teamTopic(teamId), event, payload: {}, private: true }] }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
    });
    if (!response.ok) console.error(JSON.stringify({ event: "realtime_broadcast_failed", status: response.status }));
  } catch (error) {
    console.error(
      JSON.stringify({ event: "realtime_broadcast_failed", error: error instanceof Error ? error.message : String(error) }),
    );
  }
}

/** Announces an event after the response has gone, so nobody waits on Supabase. */
export function announce(teamId: string, event: string) {
  const config = realtimeConfig();
  if (!config) return;
  after(() => broadcast(config, teamId, event));
}
