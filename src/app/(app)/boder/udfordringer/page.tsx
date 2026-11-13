import { redirect } from "next/navigation";

/**
 * Challenges no longer have a page: they open in a sheet on the board. Links in
 * notifications already sent, and bookmarks, land on the board with the sheet open.
 */
export default function OldChallengesPage() {
  redirect("/boder?udfordringer");
}
