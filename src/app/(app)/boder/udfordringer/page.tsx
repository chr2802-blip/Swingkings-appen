import { redirect } from "next/navigation";

/**
 * Challenges have no page: one waiting stands in the fine box's history among the fines.
 * Links in notifications already sent, and bookmarks, land there.
 */
export default function OldChallengesPage() {
  redirect("/boder/historik");
}
