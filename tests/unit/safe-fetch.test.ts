import { afterEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ answers: new Map<string, string[]>() }));
vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => {
    const addresses = dns.answers.get(host);
    if (!addresses) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  },
}));

import { BlockedAddressError, MAX_REDIRECTS, assertPublicUrl, isBlockedAddress, isBlockedHost, safeFetch } from "@/lib/safe-fetch";

afterEach(() => {
  dns.answers.clear();
  vi.unstubAllGlobals();
});

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fc00::1", "fd12::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "[::ffff:10.0.0.1]", "::127.0.0.1", "64:ff9b::10.0.0.1",
    "not-an-ip", "1.2.3", "",
  ])("refuses %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::8.8.8.8"])(
    "allows %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe("isBlockedHost", () => {
  it("refuses names that mean this machine or a private network, before any lookup", () => {
    for (const host of ["localhost", "LOCALHOST.", "app.localhost", "printer.local", "metadata.google.internal", "127.0.0.1", "[::1]"]) {
      expect(isBlockedHost(host), host).toBe(true);
    }
    expect(isBlockedHost("kampklar.dk")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("checks every address a name resolves to", async () => {
    dns.answers.set("kampklar.dk", ["93.184.216.34"]);
    dns.answers.set("sneaky.example", ["93.184.216.34", "10.0.0.5"]);
    dns.answers.set("empty.example", []);
    await expect(assertPublicUrl(new URL("https://kampklar.dk/feed"))).resolves.toBeUndefined();
    await expect(assertPublicUrl(new URL("https://sneaky.example/"))).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(assertPublicUrl(new URL("https://empty.example/"))).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(assertPublicUrl(new URL("https://nowhere.example/"))).rejects.toThrow("ENOTFOUND");
  });

  it("refuses anything but http and https", async () => {
    await expect(assertPublicUrl(new URL("ftp://8.8.8.8/"))).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(assertPublicUrl(new URL("file:///etc/passwd"))).rejects.toBeInstanceOf(BlockedAddressError);
  });
});

describe("safeFetch", () => {
  it("follows redirects itself, checking each hop before asking it", async () => {
    dns.answers.set("a.example", ["93.184.216.34"]);
    dns.answers.set("b.example", ["93.184.216.35"]);
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      asked.push(url.toString());
      expect(init.redirect).toBe("manual");
      if (url.hostname === "a.example") return new Response(null, { status: 302, headers: { location: "https://b.example/feed.ics" } });
      return new Response("BEGIN:VCALENDAR");
    });
    const response = await safeFetch(new URL("https://a.example/start"));
    expect(await response.text()).toBe("BEGIN:VCALENDAR");
    expect(asked).toEqual(["https://a.example/start", "https://b.example/feed.ics"]);
  });

  it("never asks an internal address a redirect points at", async () => {
    dns.answers.set("a.example", ["93.184.216.34"]);
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      asked.push(url.toString());
      return new Response(null, { status: 301, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    });
    await expect(safeFetch(new URL("https://a.example/"))).rejects.toBeInstanceOf(BlockedAddressError);
    expect(asked).toEqual(["https://a.example/"]);
  });

  it("gives up on an endless chain of redirects", async () => {
    dns.answers.set("loop.example", ["93.184.216.34"]);
    let hops = 0;
    vi.stubGlobal("fetch", async () => {
      hops++;
      return new Response(null, { status: 302, headers: { location: "/again" } });
    });
    await expect(safeFetch(new URL("https://loop.example/"))).rejects.toThrow(`More than ${MAX_REDIRECTS} redirects`);
    expect(hops).toBe(MAX_REDIRECTS + 1);
  });

  it("returns a redirect status without a location as it is", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 304 }));
    expect((await safeFetch(new URL("https://8.8.8.8/"))).status).toBe(304);
  });
});
