import { redirect } from "next/navigation";

/** Tasks live on their activities now; your own are counted on the front page. */
export default function OldTasksPage() {
  redirect("/oversigt");
}
