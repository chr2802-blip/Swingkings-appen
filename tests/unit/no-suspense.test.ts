import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No Suspense boundaries in the app: no `<Suspense>` and no `loading.tsx`.
 *
 * Twice a boundary made buttons hang. A form action that calls `revalidatePath` runs in a
 * transition, and the transition waits for every boundary on the page to stream in anew;
 * on a slow machine it sometimes never settled, and the button stayed on "Stemmer…" with
 * the vote saved. First `src/app/(app)/loading.tsx`, then the `<Suspense>` round the
 * front page's feed — each failed CI on a few runs in ten and passed on a fast laptop.
 * Without a boundary the browser suite ran 64 of 64 on one CPU core.
 */

const root = join(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(join(root, "src")).map((path) => relative(root, path).split("\\").join("/"));

describe("Suspense boundaries", () => {
  it("there is no loading.tsx", () => {
    expect(files.filter((file) => /\/loading\.(t|j)sx?$/.test(file))).toEqual([]);
  });

  it("no component renders <Suspense>", () => {
    const offenders = files
      .filter((file) => /\.(t|j)sx$/.test(file))
      .filter((file) => /<Suspense\b/.test(readFileSync(join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
