"use client";

/**
 * The phone's half of `src/lib/realtime.ts`: joins the team's private Realtime channel
 * and calls `onNudge` whenever the server announces `event`. `onLive` says whether the
 * channel is joined, which lets the caller slow its poll down — and speed it up again
 * the moment the socket drops. Nothing is loaded when Realtime is not configured, and
 * any failure leaves the caller polling as if none of this existed.
 */
export function followTeamSignal(event: string, onNudge: () => void, onLive: (live: boolean) => void): () => void {
  let stopped = false;
  let leave: (() => void) | null = null;

  void (async () => {
    const first = await fetchToken();
    if (stopped || !first) return;
    const { RealtimeClient } = await import("@supabase/realtime-js");
    if (stopped) return;

    let current = first;
    const client = new RealtimeClient(`${first.url.replace(/^http/i, "ws")}/realtime/v1`, {
      params: { apikey: first.publishableKey },
      accessToken: async () => {
        if (current.expiresAt - Date.now() / 1000 < 5 * 60) {
          const next = await fetchToken();
          if (next) current = next;
        }
        return current.token;
      },
    });
    await client.setAuth();
    if (stopped) {
      client.disconnect();
      return;
    }
    const channel = client
      .channel(first.topic, { config: { private: true } })
      .on("broadcast", { event }, () => onNudge())
      .subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") {
          onLive(true);
          onNudge();
        } else {
          onLive(false);
        }
      });
    leave = () => {
      void client.removeChannel(channel);
      client.disconnect();
    };
    if (stopped) leave();
  })().catch(() => {});

  return () => {
    stopped = true;
    onLive(false);
    leave?.();
  };
}

type TokenAnswer = { url: string; publishableKey: string; topic: string; token: string; expiresAt: number };

async function fetchToken(): Promise<TokenAnswer | null> {
  try {
    const response = await fetch("/api/realtime/token", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { enabled?: boolean } & Partial<TokenAnswer>;
    if (!body.enabled || !body.url || !body.publishableKey || !body.topic || !body.token || !body.expiresAt) return null;
    return body as TokenAnswer;
  } catch {
    return null;
  }
}
