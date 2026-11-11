import type { TeamTheme } from "@prisma/client";

/** The colours a team can wear. What each looks like lives in globals.css. */
export const THEMES: { value: TeamTheme; label: string }[] = [
  { value: "SWINGKINGS", label: "Swingkings" },
  { value: "GREEN", label: "Grøn" },
  { value: "BLUE", label: "Blå" },
  { value: "RED", label: "Rød" },
  { value: "BLACK", label: "Sort" },
  { value: "ORANGE", label: "Orange" },
  { value: "PURPLE", label: "Lilla" },
];

export const DEFAULT_THEME: TeamTheme = "SWINGKINGS";

/**
 * Each theme's frame colour, for the meta tag CSS cannot reach. Kept equal to `--band`
 * in globals.css. Only the club's own colours have a dark frame.
 */
const LIGHT_BAND = "#f4f1ea";
export const BANDS: Record<TeamTheme, string> = {
  SWINGKINGS: "#2661ad",
  GREEN: LIGHT_BAND,
  BLUE: LIGHT_BAND,
  RED: LIGHT_BAND,
  BLACK: LIGHT_BAND,
  ORANGE: LIGHT_BAND,
  PURPLE: LIGHT_BAND,
};

/** Whether the phone's own bars sit on a dark frame and want white text. */
export function darkBand(theme: TeamTheme) {
  return BANDS[theme] !== LIGHT_BAND;
}
