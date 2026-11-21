import { describe, expect, it, vi } from "vitest";
import { syncPush, type PushDevice, type PushSubscriptionJson } from "@/lib/push-sync";

const kept: PushSubscriptionJson = { endpoint: "https://web.push.apple.com/old", keys: { p256dh: "p", auth: "a" } };
const fresh: PushSubscriptionJson = { endpoint: "https://web.push.apple.com/new", keys: { p256dh: "p2", auth: "a2" } };

function device(over: Partial<PushDevice> = {}) {
  return {
    supported: true,
    configured: true,
    permission: "granted" as NotificationPermission,
    getSubscription: vi.fn(async () => kept as PushSubscriptionJson | null),
    subscribe: vi.fn(async () => fresh),
    save: vi.fn(async () => true),
    ...over,
  };
}

describe("syncPush", () => {
  it("makes a new subscription without asking when iOS dropped the old one, and saves it", async () => {
    const phone = device({ getSubscription: vi.fn(async () => null) });
    expect(await syncPush(phone)).toBe("on");
    expect(phone.subscribe).toHaveBeenCalledOnce();
    expect(phone.save).toHaveBeenCalledWith(fresh);
  });

  it("saves a subscription the device still has, so the server holds the current address", async () => {
    const phone = device();
    expect(await syncPush(phone)).toBe("on");
    expect(phone.subscribe).not.toHaveBeenCalled();
    expect(phone.save).toHaveBeenCalledWith(kept);
  });

  it("never subscribes before the person has said yes: that needs their press", async () => {
    for (const permission of ["default", "denied"] as NotificationPermission[]) {
      const phone = device({ permission, getSubscription: vi.fn(async () => null) });
      expect(await syncPush(phone)).toBe(permission === "denied" ? "blocked" : "off");
      expect(phone.subscribe).not.toHaveBeenCalled();
      expect(phone.save).not.toHaveBeenCalled();
    }
  });

  it("offers the button again when the subscription cannot be made or the server refuses it", async () => {
    expect(await syncPush(device({ getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => Promise.reject(new Error("AbortError"))) }))).toBe("off");
    expect(await syncPush(device({ save: vi.fn(async () => false) }))).toBe("off");
    expect(await syncPush(device({ save: vi.fn(async () => Promise.reject(new Error("offline"))) }))).toBe("off");
  });

  it("says when push cannot be had here at all, before asking the browser anything", async () => {
    const safari = device({ supported: false });
    expect(await syncPush(safari)).toBe("unsupported");
    expect(await syncPush(device({ configured: false }))).toBe("unconfigured");
    expect(safari.getSubscription).not.toHaveBeenCalled();
  });
});
