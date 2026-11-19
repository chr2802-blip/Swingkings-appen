import Link from "next/link";
import type { ComponentProps } from "react";

/** Where a person's page is: their fines, challenges and jobs — and, for yourself, your profile. */
export function playerHref(userId: string) {
  return `/spiller/${userId}`;
}

/** A person's page, open at the tab with their jobs. */
export function playerTasksHref(userId: string) {
  return `${playerHref(userId)}/opgaver`;
}

/**
 * How a `PlayerLink` answers a press, by what it is: a name in a line of text fades and
 * is given a finger-sized target round it (`tap-inline`); a face presses in as an icon; a
 * row or a chip as a card or a button (`globals.css`).
 */
const PRESS = {
  text: "press-text tap-inline hover:underline",
  icon: "press-icon rounded-full",
  button: "press-button",
  card: "press-card",
} as const;

/** A name (or a face) that opens the person's page. Used wherever a teammate is named. */
export function PlayerLink({
  userId,
  press = "text",
  className = "",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { userId: string; press?: keyof typeof PRESS }) {
  return <Link href={playerHref(userId)} className={`${PRESS[press]} ${className}`} {...props} />;
}
