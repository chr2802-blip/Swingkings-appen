import { redirect } from "next/navigation";

/** "Kampe" became "Aktiviteter"; old links and bookmarks land there. */
export default function OldMatchesPage() {
  redirect("/aktiviteter");
}
