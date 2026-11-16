import { requireTeamUser } from "@/lib/auth";
import { PlayerScreen } from "@/components/player-screen";

export default async function PlayerTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlayerScreen user={await requireTeamUser()} id={id} show="/opgaver" />
  );
}
