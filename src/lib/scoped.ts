import { notFound } from "next/navigation";
import type { TeamUser } from "./auth";

/**
 * Fetches one record through the caller's team-bound client and answers 404 when it is
 * not there — which is also the answer for another team's record, since `teamDb` never
 * finds those. The same answer as an id that never existed tells an outsider nothing.
 */
export async function foundOr404<T>(lookup: Promise<T | null>): Promise<T> {
  const record = await lookup;
  if (!record) notFound();
  return record;
}

export type { TeamUser };
