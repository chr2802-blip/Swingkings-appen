import { requireTeamUser } from "@/lib/auth";
import { FinesScreen } from "@/components/fines-screen";

export default async function ChallengesPage() {
  return <FinesScreen user={await requireTeamUser()} show="/boder/udfordringer" />;
}
