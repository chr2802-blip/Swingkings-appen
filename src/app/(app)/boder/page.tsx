import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { CHALLENGES_PARAM, FinesScreen } from "@/components/fines-screen";

export default async function FinesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A link to the challenges' sheet that no longer is: they are in the history.
  if (CHALLENGES_PARAM in params) redirect("/boder/historik");
  return <FinesScreen user={await requireTeamUser()} show="/boder" />;
}
