import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { PlayerScreen } from "@/components/player-screen";
import { playerHref } from "@/components/player-link";

/** The "Profil" tab: only on one's own page; on anybody else's it is their page. */
export default async function PlayerProfileTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireTeamUser();
  if (id !== user.id) redirect(playerHref(id));
  return <PlayerScreen user={user} id={id} show="/profil" />;
}
