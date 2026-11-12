import type { MemberRole, PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { generateLinkToken, hashLinkToken } from "@/lib/invite-links";
import { PHOTO_FIELD } from "@/lib/photo-file";
import { SESSION_COOKIE_NAME, cookieStore } from "./next-mocks";
import { pngBytes } from "./images";

let counter = 0;
const unique = () => `${Date.now().toString(36)}${counter++}`;

export const TEST_PASSWORD = "korrekt-hest-batteri";

// bcrypt at the app's cost takes about a tenth of a second, and the suite makes hundreds
// of people whose password nobody varies. The hash is the same work for the same
// password, so it is done once per password: every user still carries a real hash.
const hashes = new Map<string, Promise<string>>();
function passwordHash(password: string) {
  let hash = hashes.get(password);
  if (!hash) {
    hash = hashPassword(password);
    hashes.set(password, hash);
  }
  return hash;
}

export async function makeTeam(name = "Swingkings", data: { finePriceKr?: number; calendarUrl?: string | null } = {}) {
  return prisma.team.create({ data: { name, ...data } });
}

/** Somebody with no team, or a super admin. */
export async function makeUser(
  options: { name?: string; email?: string; password?: string; role?: PlatformRole } = {},
) {
  const name = options.name ?? "Test";
  return prisma.user.create({
    data: {
      email: options.email ?? `${name.toLowerCase().replace(/\W/g, "")}${unique()}@test.dk`,
      name,
      passwordHash: await passwordHash(options.password ?? TEST_PASSWORD),
      role: options.role ?? "USER",
    },
  });
}

/** Somebody on a team, which becomes the team on their screen. */
export async function makeMember(
  teamId: string,
  name: string,
  role: MemberRole = "PLAYER",
  options: { email?: string; password?: string; takesTasks?: boolean } = {},
) {
  const user = await makeUser({ name, email: options.email, password: options.password });
  await prisma.teamMember.create({ data: { teamId, userId: user.id, role, takesTasks: options.takesTasks ?? true } });
  return prisma.user.update({ where: { id: user.id }, data: { activeTeamId: teamId } });
}

/** Puts somebody already made on another team as well. */
export function joinTeam(userId: string, teamId: string, role: MemberRole = "PLAYER") {
  return prisma.teamMember.create({ data: { userId, teamId, role } });
}

/** A team with a coach, a treasurer and two players. */
export async function makeSquad(name = "Swingkings", data: { finePriceKr?: number } = {}) {
  const team = await makeTeam(name, data);
  const admin = await makeMember(team.id, "Træner", "ADMIN");
  const treasurer = await makeMember(team.id, "Kasserer", "TREASURER");
  const anna = await makeMember(team.id, "Anna");
  const bo = await makeMember(team.id, "Bo");
  return { team, admin, treasurer, anna, bo };
}

/**
 * Puts a valid session cookie in place, exactly as a real login would. The version is
 * read from the row, so a test that changed a password gets a cookie still accepted.
 */
export async function signIn(user: { id: string }) {
  const { tokenVersion } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { tokenVersion: true } });
  await createSession(user.id, tokenVersion);
}

export function signOut() {
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** A FormData from a plain object; an array value becomes the same field repeated. */
export function formData(fields: Record<string, string | number | boolean | null | undefined | (string | number)[]> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const item of value) data.append(key, String(item));
    else data.append(key, String(value));
  }
  return data;
}

/** An invitation link and its token, the one time the token is known. */
export async function makeInviteLink(options: {
  teamId: string;
  createdById: string;
  maxUses?: number;
  uses?: number;
  expiresAt?: Date;
}) {
  const token = generateLinkToken();
  const link = await prisma.inviteLink.create({
    data: {
      teamId: options.teamId,
      createdById: options.createdById,
      tokenHash: hashLinkToken(token),
      maxUses: options.maxUses ?? 30,
      uses: options.uses ?? 0,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  return { link, token };
}

export function makeMatch(
  teamId: string,
  options: { startsAt?: Date; opponent?: string; title?: string; source?: "MANUAL" | "KAMPKLAR"; kind?: "MATCH" | "TRAINING" | "OTHER"; externalUid?: string } = {},
) {
  const opponent = options.opponent ?? "B.93";
  return prisma.match.create({
    data: {
      teamId,
      title: options.title ?? `Swingkings - ${opponent}`,
      opponent: (options.kind ?? "MATCH") === "MATCH" ? opponent : null,
      startsAt: options.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      source: options.source ?? "MANUAL",
      kind: options.kind ?? "MATCH",
      externalUid: options.externalUid ?? (options.source === "KAMPKLAR" ? unique() : null),
    },
  });
}

/** A stored picture filed under a team, as an upload would leave it. */
export function makePhoto(teamId: string, options: { createdAt?: Date } = {}) {
  const bytes = Buffer.from(pngBytes(8, 6));
  return prisma.photo.create({
    data: {
      teamId,
      contentType: "image/png",
      width: 8,
      height: 6,
      bytes,
      thumbWidth: 8,
      thumbHeight: 6,
      thumbBytes: Buffer.from(pngBytes(4, 3)),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
  });
}

export async function makePoll(
  teamId: string,
  authorId: string,
  options: { anonymous?: boolean; multipleChoice?: boolean; closesAt?: Date | null; closedAt?: Date | null; texts?: string[] } = {},
) {
  const post = await prisma.post.create({
    data: {
      teamId,
      authorId,
      poll: {
        create: {
          teamId,
          question: "Hvornår er der fest?",
          anonymous: options.anonymous ?? false,
          multipleChoice: options.multipleChoice ?? false,
          closesAt: options.closesAt ?? null,
          closedAt: options.closedAt ?? null,
          options: { create: (options.texts ?? ["Fredag", "Lørdag"]).map((text, position) => ({ text, position })) },
        },
      },
    },
    include: { poll: { include: { options: { orderBy: { position: "asc" } } } } },
  });
  return { post, poll: post.poll!, optionIds: post.poll!.options.map((o) => o.id) };
}

export { PHOTO_FIELD };
