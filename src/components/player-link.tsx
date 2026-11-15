import Link from "next/link";
import type { ComponentProps } from "react";

/** Where a person's page is: their fines, challenges and jobs — and, for yourself, your profile. */
export function playerHref(userId: string) {
  return `/spiller/${userId}`;
}

/** The search parameter (and anchor) that opens a person's page at their whole list of jobs. */
export const TASKS_PARAM = "opgaver";

/** A person's page, scrolled to their jobs with the whole list open. */
export function playerTasksHref(userId: string) {
  return `${playerHref(userId)}?${TASKS_PARAM}#${TASKS_PARAM}`;
}

/** A name (or a face) that opens the person's page. Used wherever a teammate is named. */
export function PlayerLink({
  userId,
  className = "",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { userId: string }) {
  return <Link href={playerHref(userId)} className={`hover:underline ${className}`} {...props} />;
}
