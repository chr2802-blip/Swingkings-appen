import { requireTeamUser } from "@/lib/auth";
import { CHALLENGES_PARAM, FinesScreen } from "@/components/fines-screen";

export default async function FinesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <FinesScreen user={await requireTeamUser()} show="/boder" openChallenges={CHALLENGES_PARAM in params} />;
}
