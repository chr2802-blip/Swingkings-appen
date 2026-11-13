import { requireUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { NavLinks } from "@/components/nav-links";
import { BottomNav } from "@/components/bottom-nav";
import { TeamMenu } from "@/components/team-menu";
import { Avatar } from "@/components/photo";
import Link from "next/link";
import { playerHref } from "@/components/player-link";
import { StripeBand } from "@/components/crest";
import { ScrollBars } from "@/components/scroll-bars";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const showAdmin = user.role === "SUPER_ADMIN";
  // Your own page is your profile; somebody on no team has only the settings.
  const profileHref = user.teamId ? playerHref(user.id) : "/profil";

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="app-topbar app-glass sticky top-0 z-30 pt-[env(safe-area-inset-top)] text-[var(--band-text)]">
        <div className="mx-auto flex max-w-5xl items-center gap-x-6 py-2.5 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <TeamMenu
            teams={user.teams}
            currentId={user.teamId}
            label={user.teamName ?? "Swingkings"}
            photoId={user.teamPhotoId}
            canAdminister={user.teamId !== null && canAdministerTeam(user, user.teamId)}
            showAdmin={showAdmin}
            profileHref={profileHref}
          />
          <NavLinks showAdmin={showAdmin} />
          <Link href={profileHref} className="press-icon ml-auto flex items-center gap-2 text-sm text-[var(--band-soft)]" aria-label="Min profil">
            <span className="hidden sm:inline">{user.name}</span>
            <Avatar name={user.name} photoId={user.photoId} size="sm" />
          </Link>
        </div>
        <StripeBand />
      </header>

      <main className="mx-auto max-w-5xl pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:pb-10">
        <div className="animate-page-in">{children}</div>
      </main>

      <ScrollBars />
      {user.teamId && <BottomNav />}
    </div>
  );
}
