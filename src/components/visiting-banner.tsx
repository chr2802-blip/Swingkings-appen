import Link from "next/link";
import { switchTeam } from "@/app/actions/teams";
import type { Membership } from "@/lib/auth";

/**
 * Shown to the super admin on a team they are not on: whatever they do here, they do as
 * an outsider (a fine they give, a message they write), so it should never come as a surprise.
 */
export function VisitingBanner({ teamName, home }: { teamName: string; home: Membership | null }) {
  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="min-w-0 flex-1">
        Du kigger på <strong>{teamName}</strong> som super admin. Du er ikke på holdet.
      </p>
      {home ? (
        <form action={switchTeam.bind(null, home.id)}>
          <button className="press-button rounded-lg px-3 py-1.5 font-medium underline-offset-2 hover:underline">
            Tilbage til {home.name}
          </button>
        </form>
      ) : (
        <Link href="/admin" className="rounded-lg px-3 py-1.5 font-medium underline-offset-2 hover:underline">
          Til Admin
        </Link>
      )}
    </div>
  );
}
