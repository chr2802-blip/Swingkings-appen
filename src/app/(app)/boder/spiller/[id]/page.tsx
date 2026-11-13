import { redirect } from "next/navigation";
import { playerHref } from "@/components/player-link";

/**
 * A player's page moved out of the fine box to `/spiller/<id>`, where it also shows their
 * challenges and jobs. Links in notifications already sent, and bookmarks, land there.
 */
export default async function OldPlayerFinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(playerHref(id));
}
