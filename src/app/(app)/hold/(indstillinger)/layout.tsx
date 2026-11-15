import { requireTeamUser } from "@/lib/auth";
import { TeamSettingsScreen } from "@/components/team-settings-screen";

/**
 * The team settings' tabs (`/hold`, `/hold/betaling`, `/hold/opgaver`, `/hold/inviter`, `/hold/besked`) are
 * this one layout, and the pages under it are empty. A page is made again when its address
 * changes, and turning a tab changes the address: a form saved after a turn was swapped for a
 * fresh one by the refresh, before it could say "Gemt.". A layout is kept across them.
 */
export default async function TeamSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TeamSettingsScreen user={await requireTeamUser()} />
      {children}
    </>
  );
}
