"use server";

import type { ReactNode } from "react";
import { requireTeamUser } from "@/lib/auth";
import { teamDb } from "@/lib/team-db";
import { fineDetails } from "@/lib/fine-data";
import { FineDetails } from "@/components/fine-details";
import { ChallengeDetails, challengeDetailsInclude } from "@/components/challenge-details";

/**
 * The sheet behind a fine row, drawn when it is opened (`FineSheet`). A read, not a form:
 * it changes nothing, so it takes the fine's id rather than `(prev, formData)`. The fine is
 * read through `teamDb` for the viewer's own team, so another team's id — or a fine since
 * deleted — gives null, as for nothing at all.
 */
export async function loadFineDetails(id: unknown): Promise<ReactNode> {
  const user = await requireTeamUser();
  if (typeof id !== "string" || id === "") return null;
  const fine = await fineDetails(user.teamId, id);
  return fine ? <FineDetails fine={fine} user={user} /> : null;
}

/**
 * The sheet behind a challenge's row (one still waiting), drawn when it is opened, as a
 * fine's is. Another team's id, or a challenge since withdrawn, gives null.
 */
export async function loadChallengeDetails(id: unknown): Promise<ReactNode> {
  const user = await requireTeamUser();
  if (typeof id !== "string" || id === "") return null;
  const db = teamDb(user.teamId);
  const [challenge, team] = await Promise.all([
    db.challenge.findFirst({ where: { id }, include: challengeDetailsInclude }),
    db.team.findUnique({ where: { id: user.teamId }, select: { finePriceKr: true } }),
  ]);
  return challenge && team ? <ChallengeDetails challenge={challenge} user={user} finePriceKr={team.finePriceKr} /> : null;
}
