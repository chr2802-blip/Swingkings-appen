import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { playerHref } from "@/components/player-link";
import { ProfileSettings } from "@/components/profile-settings";

/**
 * On a team the settings are the "Rediger profil" tab of one's own page; links here land
 * there. Somebody on no team, or a super admin only looking in, has only this page.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  if (user.teamId && user.teamRole !== null) redirect(`${playerHref(user.id)}/profil`);
  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader title="Rediger profil" description={user.email} />
      <ProfileSettings user={user} />
    </div>
  );
}
