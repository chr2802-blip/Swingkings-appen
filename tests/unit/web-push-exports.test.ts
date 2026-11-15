import { afterEach, describe, expect, it, vi } from "vitest";
import { generateVAPIDKeys } from "web-push";
import { configurePush } from "@/lib/push";

// The integration tests stand in for web-push, so only this test runs push.ts against the
// real package. web-push 4 dropped its default export: `import webpush from "web-push"`
// became undefined, and every push would have failed without a word, behind green tests.
describe("push against the real web-push", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hands real VAPID keys to web-push", () => {
    const keys = generateVAPIDKeys();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    expect(configurePush()).toBe(true);
  });
});
