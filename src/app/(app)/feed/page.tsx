import { redirect } from "next/navigation";

/** The feed lives on the front page now; old links and notifications land there. */
export default function FeedPage() {
  redirect("/oversigt#feed");
}
