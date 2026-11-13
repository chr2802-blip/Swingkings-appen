import { vi } from "vitest";

export const FAKE_URL = "https://fake-project.supabase.test";

/**
 * Supabase Storage stood in for: the three calls `src/lib/storage.ts` makes, answered from
 * memory. Anything else goes nowhere, so a test cannot reach a real network by accident.
 */
export function fakeStorage() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const log: string[] = [];
  const state = { failWrites: false };
  const base = `${FAKE_URL}/storage/v1/object/photos`;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      log.push(`${method} ${url.replace(FAKE_URL, "")}`);
      if (!url.startsWith(base)) throw new Error(`Unexpected request: ${method} ${url}`);
      const key = url.slice(base.length + 1);
      if (method === "POST") {
        if (state.failWrites) return new Response("boom", { status: 500 });
        objects.set(key, { bytes: new Uint8Array(init.body as Uint8Array), contentType: new Headers(init.headers).get("content-type") ?? "" });
        return new Response("{}", { status: 200 });
      }
      if (method === "DELETE") {
        for (const name of JSON.parse(String(init.body)).prefixes as string[]) objects.delete(name);
        return new Response("[]", { status: 200 });
      }
      const object = objects.get(key);
      if (!object) return new Response("{}", { status: 404 });
      return new Response(new Uint8Array(object.bytes), { status: 200, headers: { "content-type": object.contentType } });
    }),
  );

  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  return {
    objects,
    log,
    state,
    restore() {
      vi.unstubAllGlobals();
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SECRET_KEY;
    },
  };
}
