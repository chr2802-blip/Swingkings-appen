import { redirect } from "next/navigation";

/**
 * Challenges no longer have a page: they open in a sheet on the fine box. Links in
 * notifications already sent, and bookmarks, land there with the sheet open.
 */
export default function OldChallengesPage() {
  redirect("/boder?udfordringer");
}
