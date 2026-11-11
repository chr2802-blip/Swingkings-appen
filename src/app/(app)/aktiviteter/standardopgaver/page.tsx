import { redirect } from "next/navigation";

/** Standard tasks moved to the team settings; old links land there. */
export default function OldTemplatesPage() {
  redirect("/hold#standardopgaver");
}
