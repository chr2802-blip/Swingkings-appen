import { afterEach, describe, expect, it, vi } from "vitest";
import { getObject, putObject, removeObjects, storageConfig, thumbKey } from "@/lib/storage";

afterEach(() => vi.restoreAllMocks());

const config = { url: "https://x.supabase.co", secretKey: "sb_secret_abc" };

describe("storageConfig", () => {
  it("needs the address and the secret key, and nothing else", () => {
    expect(storageConfig({})).toBeNull();
    expect(storageConfig({ SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(storageConfig({ SUPABASE_SECRET_KEY: "k" })).toBeNull();
    expect(storageConfig({ SUPABASE_URL: " https://x.supabase.co// ", SUPABASE_SECRET_KEY: " k " })).toEqual({ url: "https://x.supabase.co", secretKey: "k" });
  });
});

describe("the Storage calls", () => {
  it("writes to the private bucket with the key as apikey, and as bearer only for a legacy JWT key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await putObject(config, "team/pic", new Uint8Array([1, 2, 3]), "image/png");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://x.supabase.co/storage/v1/object/photos/team/pic");
    expect(init).toMatchObject({ method: "POST" });
    expect(new Headers(init!.headers)).toSatisfy((h: Headers) => h.get("apikey") === "sb_secret_abc" && h.get("authorization") === null && h.get("x-upsert") === "false");

    await getObject({ ...config, secretKey: "eyJhbGciOi.legacy.jwt" }, "team/pic");
    expect(new Headers(fetchMock.mock.calls[1]![1]!.headers).get("authorization")).toBe("Bearer eyJhbGciOi.legacy.jwt");
  });

  it("says no object for a missing one, and fails loudly for anything else", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await getObject(config, "gone")).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    await expect(getObject(config, "x")).rejects.toThrow(/500/);
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 403 }));
    await expect(putObject(config, "x", new Uint8Array(1), "image/png")).rejects.toThrow(/403/);
  });

  it("removes in one request, and never throws when it cannot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(removeObjects(config, ["a", thumbKey("a")])).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    fetchMock.mockClear();
    await removeObjects(config, []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
