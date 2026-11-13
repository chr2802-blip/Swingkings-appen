import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { BANDS, DEFAULT_THEME, THEMES, darkBand } from "@/lib/theme";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const themeEnum = Prisma.dmmf.datamodel.enums.find((e) => e.name === "TeamTheme")!.values.map((v) => v.name);

/** The `--band` a theme's own block sets, or the shared light one when it sets none. */
function cssBand(theme: string) {
  const block = new RegExp(`\\[data-theme="${theme}"\\][^{]*\\{([^}]*)\\}`).exec(css)?.[1];
  if (block === undefined) return undefined;
  return /--band:\s*(#[0-9a-f]{6})/i.exec(block)?.[1] ?? /\[data-theme\]\s*\{[^}]*--band:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
}

describe("themes", () => {
  it("offers every colour the schema knows, once, with a Danish label", () => {
    expect(THEMES.map((t) => t.value).sort()).toEqual([...themeEnum].sort());
    expect(THEMES.every((t) => t.label.length > 0)).toBe(true);
    expect(themeEnum).toContain(DEFAULT_THEME);
  });

  it("gives every theme a block in globals.css whose --band equals BANDS", () => {
    for (const theme of themeEnum) {
      expect(cssBand(theme), theme).toBeDefined();
      expect(cssBand(theme)?.toLowerCase(), theme).toBe(BANDS[theme as keyof typeof BANDS].toLowerCase());
    }
  });

  it("paints the header and tab bar solid --band, like the phone's own bars", () => {
    const read = (f: string) => readFileSync(new URL(`../../src/${f}`, import.meta.url), "utf8");
    for (const file of ["app/(app)/layout.tsx", "components/bottom-nav.tsx"]) {
      const bar = /className="(app-(?:topbar|bottombar)[^"]*)"/.exec(read(file))?.[1];
      expect(bar, file).toContain("bg-[var(--band)]");
      expect(bar, file).not.toMatch(/backdrop|glass|\bbg-[^ ]*\/\d/);
    }
    expect(css).not.toMatch(/\.app-(?:topbar|bottombar|glass)[^{]*\{[^}]*backdrop-filter/);
  });

  it("puts white text only on the club's own dark frame", () => {
    expect(themeEnum.filter((t) => darkBand(t as keyof typeof BANDS))).toEqual(["SWINGKINGS"]);
  });
});
