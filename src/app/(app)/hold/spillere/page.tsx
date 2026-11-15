import { redirect } from "next/navigation";

/** The old roster page: the rights table is now a tab of the team settings (admins only). */
export default function RosterPage() {
  redirect("/hold/rettigheder");
}
