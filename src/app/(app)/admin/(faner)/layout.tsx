import { requireSuperAdmin } from "@/lib/auth";
import { AdminScreen } from "@/components/admin-screen";

/**
 * The super admin's tabs (`/admin`, `/admin/hold`, `/admin/logoer`, `/admin/testdata`) are
 * this one layout, and the pages under it are empty — as the team settings' tabs, so a form
 * saved after a turn is not swapped for a fresh one before it can say "Gemt.".
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return (
    <>
      <AdminScreen />
      {children}
    </>
  );
}
