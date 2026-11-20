import { requireSuperAdmin } from "@/lib/auth";
import { ClubAdminScreen } from "@/components/club-admin-screen";

/**
 * A club's tabs under /admin (its teams, its club admins, its settings) are this one layout,
 * and the pages under it are empty, as /admin's own tabs.
 */
export default async function ClubAdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clubId: string }> }) {
  await requireSuperAdmin();
  const { clubId } = await params;
  return (
    <>
      <ClubAdminScreen clubId={clubId} />
      {children}
    </>
  );
}
