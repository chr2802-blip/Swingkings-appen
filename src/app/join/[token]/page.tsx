import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/access";
import { findInviteLink, LINK_PROBLEM_TEXT, linkProblem } from "@/lib/invite-links";
import { Card } from "@/components/ui";
import { LogoutButton } from "@/components/logout-button";
import { JoinAsMeForm, JoinForm } from "./join-form";

// The token is in the address: keep the page out of search engines and the token out of
// the Referer header of anything it links to.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Opening an invitation link. Only showing the page uses up nothing — chat apps fetch a
 * link to draw its preview — a place is taken only when the form is sent.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link, user] = await Promise.all([findInviteLink(token), getCurrentUser()]);
  const problem = linkProblem(link);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Image src="/logo.png" alt="" width={512} height={512} priority className="mx-auto mb-4 h-24 w-24 drop-shadow-md" />
        {link && !problem ? (
          <>
            <h1 className="text-3xl">Kom med på {link.team.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Du er inviteret som {ROLE_LABEL[link.role].toLowerCase()}.
            </p>
          </>
        ) : (
          <h1 className="text-3xl">Invitation</h1>
        )}
      </div>

      {!link || problem ? (
        <Card>
          <p role="alert" className="text-sm text-slate-700">
            {LINK_PROBLEM_TEXT[problem ?? "unknown"]}
          </p>
        </Card>
      ) : user ? (
        <Card className="space-y-4">
          {user.teams.some((team) => team.id === link.team.id) ? (
            <p className="text-sm text-slate-700">Du er allerede på {link.team.name}.</p>
          ) : (
            <p className="text-sm text-slate-700">
              Du er logget ind som <strong>{user.name}</strong>.
            </p>
          )}
          <JoinAsMeForm token={token} teamName={link.team.name} />
          <div className="text-center text-sm text-slate-500">
            Ikke dig? <LogoutButton className="inline font-medium text-[var(--accent-text)] underline" />
          </div>
        </Card>
      ) : (
        <JoinForm token={token} />
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-[var(--accent-text)] underline">
          Til login
        </Link>
      </p>
    </main>
  );
}
