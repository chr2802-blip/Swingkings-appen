"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { inviteCodeMatches } from "@/lib/invite-code";
import { checkRateLimit, clearAttempts, recordFailedAttempt } from "@/lib/rate-limit";

export type FormState = { error?: string } | undefined;

/**
 * A bcrypt hash of nothing anybody can type, compared against when the email has no
 * account — so "no such account" takes as long to answer as "wrong password".
 */
const NO_ACCOUNT_HASH = "$2b$10$I499.yDmS6fVZrn9617PmOlKo6mgT0dPUrwvUSstp./U34JZ2DJh.";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Skriv din e-mail og din adgangskode." };
  const email = parsed.data.email.toLowerCase();

  const limit = await checkRateLimit("login", email);
  if (!limit.allowed) return { error: `For mange forsøg. Prøv igen om ${limit.retryAfterMinutes} min.` };

  const user = await prisma.user.findUnique({ where: { email } });
  const matches = await verifyPassword(parsed.data.password, user?.passwordHash ?? NO_ACCOUNT_HASH);
  if (!user || !matches) {
    await recordFailedAttempt("login", email);
    return { error: "Forkert e-mail eller adgangskode." };
  }

  await clearAttempts("login", email);
  await createSession(user.id, user.tokenVersion);
  redirect("/oversigt");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const acceptSchema = z.object({
  email: z.string().email("Skriv den e-mail, invitationen blev sendt til."),
  code: z.string().min(1, "Skriv koden fra invitationen."),
  name: z.string().trim().min(1, "Skriv dit navn.").max(100),
  password: z.string().min(8, "Adgangskoden skal være mindst 8 tegn."),
});

/**
 * Joining a team with an invitation. Both the invited email and the one-time code are
 * needed. Somebody new gets an account; somebody who already has one joins with it,
 * giving their existing password.
 */
export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = acceptSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Tjek felterne og prøv igen." };
  const email = parsed.data.email.toLowerCase();

  const limit = await checkRateLimit("invite", email);
  if (!limit.allowed) return { error: `For mange forsøg. Prøv igen om ${limit.retryAfterMinutes} min.` };

  const invites = await prisma.invite.findMany({ where: { email, acceptedAt: null, expiresAt: { gt: new Date() } } });
  const invite = invites.find((candidate) => inviteCodeMatches(parsed.data.code, candidate.codeHash));
  if (!invite) {
    await recordFailedAttempt("invite", email);
    return { error: "Der er ingen gyldig invitation med den e-mail og kode." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !(await verifyPassword(parsed.data.password, existing.passwordHash))) {
    await recordFailedAttempt("invite", email);
    return { error: "Du har allerede en konto. Skriv din nuværende adgangskode." };
  }

  const user =
    existing ??
    (await prisma.user.create({
      data: { email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) },
    }));

  await prisma.$transaction([
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: user.id, teamId: invite.teamId } },
      update: { role: invite.role },
      create: { userId: user.id, teamId: invite.teamId, role: invite.role },
    }),
    prisma.user.update({ where: { id: user.id }, data: { activeTeamId: invite.teamId } }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  await clearAttempts("invite", email);
  await createSession(user.id, user.tokenVersion);
  redirect("/oversigt");
}
