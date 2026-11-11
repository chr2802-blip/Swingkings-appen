import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "@/middleware";
import { SESSION_COOKIE } from "@/lib/session-cookie";

describe("middleware", () => {
  it("sends a request without a session cookie to the login page, dropping the query", () => {
    const response = middleware(new NextRequest("https://swingkings.test/boder?tab=konto"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://swingkings.test/login");
  });

  it("lets a request with the cookie through to the page, which checks it properly", () => {
    const request = new NextRequest("https://swingkings.test/boder", { headers: { cookie: `${SESSION_COOKIE}=x` } });
    const response = middleware(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("guards every signed-in section of the app, and uses this app's own cookie", () => {
    expect(SESSION_COOKIE).toBe("swingkings_session");
    const sections = ["oversigt", "boder", "kampe", "opgaver", "feed", "chat", "hold", "profil", "admin"];
    expect(config.matcher).toEqual([...sections.map((s) => `/${s}/:path*`), "/hent-appen"]);
  });
});
