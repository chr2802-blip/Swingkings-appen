import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { MemberRole, PlatformRole, TeamTheme } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_THEME } from "./theme";

import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };
const MAX_AGE = 60 * 60 * 24 * 60;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * The claim that lets a session be ended from the outside: the cookie names the
 * account's `tokenVersion`, and changing the password bumps it, so every cookie issued
 * before the change stops being a session.
 */
export const SESSION_VERSION_CLAIM = "ver";

export async function signSession(userId: string, tokenVersion: number) {
  return new SignJWT({ sub: userId, [SESSION_VERSION_CLAIM]: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function createSession(userId: string, tokenVersion: number) {
  const token = await signSession(userId, tokenVersion);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** One of the teams somebody is on, as the switcher and the checks need it. */
export type Membership = {
  id: string;
  name: string;
  photoId: string | null;
  theme: TeamTheme;
  role: MemberRole;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  photoId: string | null;
  /** Every team this person is on. This is what says where they may go. */
  teams: Membership[];
  /** The team on screen, drawn from `teams` (or any team, for a super admin). */
  teamId: string | null;
  teamName: string | null;
  teamPhotoId: string | null;
  teamTheme: TeamTheme;
  /** What they may do on the team on screen; null only for a super admin visiting. */
  teamRole: MemberRole | null;
};

/** Cached per request: the layout and the page below it both ask. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  let version: number;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    userId = payload.sub;
    const claimed = payload[SESSION_VERSION_CLAIM];
    version = typeof claimed === "number" ? claimed : 0;
  } catch {
    return null;
  }

  const teamSelect = { id: true, name: true, photoId: true, theme: true } as const;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      activeTeam: { select: teamSelect },
      memberships: { orderBy: { createdAt: "asc" }, select: { role: true, team: { select: teamSelect } } },
    },
  });
  if (!user || user.tokenVersion !== version) return null;

  const teams: Membership[] = user.memberships.map((m) => ({ ...m.team, role: m.role }));

  // The stored choice is a preference, not a permission: it stands while it is still one
  // of their teams (or any team, for a super admin), and otherwise they land in the first.
  const active =
    teams.find((team) => team.id === user.activeTeamId) ??
    (user.role === "SUPER_ADMIN" ? user.activeTeam : null) ??
    teams[0] ??
    null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    photoId: user.photoId,
    teams,
    teamId: active?.id ?? null,
    teamName: active?.name ?? null,
    teamPhotoId: active?.photoId ?? null,
    teamTheme: active?.theme ?? DEFAULT_THEME,
    teamRole: teams.find((team) => team.id === active?.id)?.role ?? null,
  };
});

export type TeamUser = SessionUser & { teamId: string; teamName: string };

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** A user looking at one of their teams. Somebody on no team is sent to the team list. */
export async function requireTeamUser(): Promise<TeamUser> {
  const user = await requireUser();
  if (!user.teamId) redirect("/hold/vaelg");
  return user as TeamUser;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/oversigt");
  return user;
}
