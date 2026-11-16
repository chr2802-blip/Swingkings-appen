import { requireUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { NavLinks } from "@/components/nav-links";
import { BottomNav } from "@/components/bottom-nav";
import { TeamMenu } from "@/components/team-menu";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/photo";
import Link from "next/link";
import { playerHref } from "@/components/player-link";
import { StripeBand } from "@/components/crest";
import { ScrollBars } from "@/components/scroll-bars";
import { PageTransition } from "@/components/page-transition";
import { ChatButton } from "@/components/chat-button";
import { unreadChatCount } from "@/lib/chat";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const showAdmin = user.role === "SUPER_ADMIN";
  // Your own page is your profile; somebody on no team has only the settings.
  const profileHref = user.teamId ? playerHref(user.id) : "/profil";
  const unread = user.teamId ? await unreadChatCount(user.teamId, user.id) : 0;

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="app-topbar bg-[var(--band)] sticky top-0 z-30 pt-[env(safe-area-inset-top)] text-[var(--band-text)]">
        <div className="mx-auto flex max-w-5xl items-center gap-x-6 py-2.5 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex min-w-0 items-center">
            <BackButton profileHref={profileHref} />
            <TeamMenu
              teams={user.teams}
              currentId={user.teamId}
              label={user.teamName ?? "Swingkings"}
              photoId={user.teamPhotoId}
              canAdminister={user.teamId !== null && canAdministerTeam(user, user.teamId)}
              showAdmin={showAdmin}
              profileHref={profileHref}
            />
          </div>
          <NavLinks showAdmin={showAdmin} />
          <div className="ml-auto flex items-center gap-3">
            {user.teamId && <ChatButton initialUnread={unread} />}
            {/* On a phone the profile is a tab in the bar below, which somebody on no team does not have. */}
            <Link
              href={profileHref}
              className={`press-icon items-center gap-2 text-sm text-[var(--band-soft)] ${user.teamId ? "hidden md:flex" : "flex"}`}
              aria-label="Min profil"
            >
              <span className="hidden sm:inline">{user.name}</span>
              <Avatar name={user.name} photoId={user.photoId} size="sm" />
            </Link>
          </div>
        </div>
        <StripeBand />
      </header>

      <main className="mx-auto max-w-5xl pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:pb-10">
        <PageTransition>{children}</PageTransition>
      </main>

      <ScrollBars />
      {user.teamId && <BottomNav profileHref={profileHref} />}
    </div>
  );
}
