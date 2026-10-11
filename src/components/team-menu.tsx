"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MemberRole } from "@prisma/client";
import { switchTeam } from "@/app/actions/teams";
import { Avatar } from "@/components/photo";
import { LogoutButton } from "@/components/logout-button";

type TeamChoice = { id: string; name: string; photoId: string | null; role: MemberRole };

/**
 * The team's picture and name in the header, and the menu behind them: this team's
 * settings (for its admins), your profile, the other teams you are on, and logging out.
 */
export function TeamMenu({
  teams,
  currentId,
  label,
  photoId,
  canAdminister,
  showAdmin,
}: {
  teams: TeamChoice[];
  currentId: string | null;
  label: string;
  photoId: string | null;
  canAdminister: boolean;
  showAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const others = teams.filter((team) => team.id !== currentId);
  const item = "press-card block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100";

  return (
    <div ref={box} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="press-button flex min-w-0 items-center gap-2 rounded-xl py-1 pr-2"
      >
        <Avatar name={label} photoId={photoId} size="sm" />
        <span className="font-display truncate text-lg">{label}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="animate-row-in absolute top-full left-0 z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {canAdminister && (
            <Link href="/hold" className={item} onClick={() => setOpen(false)}>
              Holdindstillinger
            </Link>
          )}
          <Link href="/hold/spillere" className={item} onClick={() => setOpen(false)}>
            Spillere
          </Link>
          <Link href="/profil" className={item} onClick={() => setOpen(false)}>
            Min profil
          </Link>
          {showAdmin && (
            <Link href="/admin" className={item} onClick={() => setOpen(false)}>
              Admin
            </Link>
          )}
          {others.length > 0 && (
            <>
              <div className="my-1.5 border-t border-slate-100" />
              <p className="px-3 pt-1 pb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">Skift hold</p>
              {others.map((team) => (
                <form key={team.id} action={switchTeam.bind(null, team.id)}>
                  <button className={`${item} flex items-center gap-2`}>
                    <Avatar name={team.name} photoId={team.photoId} size="xs" />
                    <span className="truncate">{team.name}</span>
                  </button>
                </form>
              ))}
            </>
          )}
          <div className="my-1.5 border-t border-slate-100" />
          <LogoutButton className={item} />
        </div>
      )}
    </div>
  );
}
