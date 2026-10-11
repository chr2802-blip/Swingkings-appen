import type { TeamTheme } from "@prisma/client";

/** The colours a team can wear. What each looks like lives in globals.css. */
export const THEMES: { value: TeamTheme; label: string }[] = [
  { value: "GREEN", label: "Grøn" },
  { value: "BLUE", label: "Blå" },
  { value: "RED", label: "Rød" },
  { value: "BLACK", label: "Sort" },
  { value: "ORANGE", label: "Orange" },
  { value: "PURPLE", label: "Lilla" },
];

export const DEFAULT_THEME: TeamTheme = "GREEN";

/** The frame colour, for the meta tag CSS cannot reach. Kept equal to `--band`. */
export const BAND = "#f4f1ea";
