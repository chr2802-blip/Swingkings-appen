import { requireUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { NavLinks } from "@/components/nav-links";
import { BottomNav } from "@/components/bottom-nav";
import { TeamMenu } from "@/components/team-menu";
import { Avatar } from "@/components/photo";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const showAdmin = user.role === "SUPER_ADMIN";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--accent-line)] bg-[var(--band)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center gap-x-6 py-2.5 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <TeamMenu
            teams={user.teams}
            currentId={user.teamId}
            label={user.teamName ?? "Swingkings"}
            photoId={user.teamPhotoId}
            canAdminister={user.teamId !== null && canAdministerTeam(user, user.teamId)}
            showAdmin={showAdmin}
          />
          <NavLinks showAdmin={showAdmin} />
          <Link href="/profil" className="press-icon ml-auto flex items-center gap-2 text-sm text-slate-500" aria-label="Min profil">
            <span className="hidden sm:inline">{user.name}</span>
            <Avatar name={user.name} photoId={user.photoId} size="sm" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:pb-10">
        <div className="animate-page-in">{children}</div>
      </main>

      {user.teamId && <BottomNav />}
    </div>
  );
}
