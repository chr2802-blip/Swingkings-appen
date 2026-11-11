import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nothing new without a test. Every server module, every action file, every API route is
 * imported by at least one test, and every page is opened by at least one browser spec.
 * A new file that nobody tests fails here, by name, before it is merged.
 *
 * This is a floor, not a measure: it proves a test reaches the file, and the tests
 * themselves prove what it does. Something genuinely untestable here goes in `EXEMPT`
 * with the reason, and the reason is reviewed with the rest of the change.
 */

const root = join(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string) => relative(root, path).split("\\").join("/");
const sources = (dir: string) => walk(join(root, dir)).map(rel);
const read = (files: string[]) => files.map((file) => readFileSync(join(root, file), "utf8")).join("\n");

const testText = read(sources("tests").filter((f) => f.endsWith(".ts") && !f.endsWith("test-coverage.test.ts")));
const e2eText = read(sources("e2e").filter((f) => f.endsWith(".ts")));

/** Files no test imports on purpose, and why. */
const EXEMPT: Record<string, string> = {
  "src/lib/push-client.ts": "browser-only: service worker and PushManager, which neither suite has",
  "src/lib/prisma.ts": "the client itself; every integration test goes through it",
};

/** `src/lib/x.ts` → `@/lib/x`, which is how a test imports it. */
const importPath = (file: string) => "@/" + file.replace(/^src\//, "").replace(/\.ts$/, "");
const imported = (file: string) => testText.includes(`"${importPath(file)}"`);

describe("every module has a test", () => {
  const modules = [
    ...sources("src/lib").filter((f) => f.endsWith(".ts")),
    ...sources("src/app/actions").filter((f) => f.endsWith(".ts")),
    ...sources("src/app/api").filter((f) => f.endsWith("route.ts")),
    "src/middleware.ts",
  ];

  it.each(modules.filter((f) => !EXEMPT[f]))("%s is imported by a test", (file) => {
    expect(
      imported(file),
      `${file} has no test. Add one under tests/unit (pure code) or tests/integration (database, actions, routes) ` +
        `that imports "${importPath(file)}", or list it in EXEMPT with the reason.`,
    ).toBe(true);
  });

  it("exempts only files that exist", () => {
    for (const file of Object.keys(EXEMPT)) expect(modules, file).toContain(file);
  });
});

describe("every page is opened by a browser spec", () => {
  /** `src/app/(app)/kampe/[id]/page.tsx` → "/kampe/" followed by an id. */
  const pages = sources("src/app")
    .filter((f) => f.endsWith("/page.tsx"))
    .map((file) => {
      const route = "/" + file.replace(/^src\/app\//, "").replace(/\/?page\.tsx$/, "").replace(/\([^)]+\)\/?/g, "");
      return { file, route: route === "/" ? "/" : route.replace(/\/$/, "") };
    });

  it.each(pages)("$route is visited in e2e/", ({ file, route }) => {
    const dynamic = route.indexOf("/[");
    const visited =
      dynamic === -1
        ? new RegExp(`goto\\(["'\`]${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'\`#?])`).test(e2eText)
        : e2eText.includes(`goto(\`${route.slice(0, dynamic)}/\${`);
    expect(visited, `${file} is never opened by a browser spec. Add a test in e2e/ that does page.goto("${route}").`).toBe(true);
  });
});
