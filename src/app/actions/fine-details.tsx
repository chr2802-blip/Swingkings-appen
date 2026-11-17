"use server";

import type { ReactNode } from "react";
import { requireTeamUser } from "@/lib/auth";
import { fineHistory } from "@/lib/fine-data";
import { FineDetails } from "@/components/fine-details";

/**
 * The sheet behind a fine row, drawn when it is opened (`FineSheet`). A read, not a form:
 * it changes nothing, so it takes the fine's id rather than `(prev, formData)`. The fine is
 * read through `teamDb` for the viewer's own team, so another team's id — or a fine since
 * deleted — gives null, as for nothing at all.
 */
export async function loadFineDetails(id: unknown): Promise<ReactNode> {
  const user = await requireTeamUser();
  if (typeof id !== "string" || id === "") return null;
  const [fine] = await fineHistory(user.teamId, { id });
  return fine ? <FineDetails fine={fine} user={user} /> : null;
}
