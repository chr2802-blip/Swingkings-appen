"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { findInviteLink, LINK_PROBLEM_TEXT, linkProblem, redeemInviteLink, type Joiner } from "@/lib/invite-links";
import { checkRateLimit, clearAttempts, recordAttempt, takeAttempt } from "@/lib/rate-limit";

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
    await recordAttempt("login", email);
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

const joinSchema = z.object({
  token: z.string().min(1, "Linket mangler. Åbn det igen fra beskeden."),
  email: z.string().trim().email("Skriv en gyldig e-mail."),
  name: z.string().trim().min(1, "Skriv dit navn.").max(100),
  password: z.string().min(8, "Adgangskoden skal være mindst 8 tegn."),
});

const tooMany = (minutes: number) =>
  `Der er oprettet mange konti herfra på kort tid. Prøv igen om ${minutes} min.`;

/**
 * Signing up with an invitation link. Somebody new gets an account; somebody who already
 * has one joins with it, giving their existing password.
 *
 * Making accounts is limited three ways: the link's own `maxUses`, counted in the same
 * transaction that makes the account; `signup`, accounts per address per hour; and
 * `join-link`, accounts per link per hour from anywhere. Wrong passwords for an existing
 * account count under `join`, like login's.
 */
export async function joinWithLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = joinSchema.safeParse({
    token: formData.get("token"),
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Tjek felterne og prøv igen." };
  const email = parsed.data.email.toLowerCase();

  const link = await findInviteLink(parsed.data.token);
  const problem = linkProblem(link);
  if (!link || problem) return { error: LINK_PROBLEM_TEXT[problem ?? "unknown"] };

  const limit = await checkRateLimit("join", email);
  if (!limit.allowed) return { error: `For mange forsøg. Prøv igen om ${limit.retryAfterMinutes} min.` };

  const existing = await prisma.user.findUnique({ where: { email } });
  let joiner: Joiner;
  if (existing) {
    if (!(await verifyPassword(parsed.data.password, existing.passwordHash))) {
      await recordAttempt("join", email);
      return { error: "Der findes allerede en konto med den e-mail. Skriv din nuværende adgangskode." };
    }
    joiner = { userId: existing.id };
  } else {
    // Counted before the account is made, so a burst of requests sees itself.
    const fromHere = await takeAttempt("signup", "");
    if (!fromHere.allowed) return { error: tooMany(fromHere.retryAfterMinutes) };
    const throughLink = await takeAttempt("join-link", link.id);
    if (!throughLink.allowed) return { error: tooMany(throughLink.retryAfterMinutes) };
    joiner = { newUser: { email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) } };
  }

  let result;
  try {
    result = await redeemInviteLink(link.id, joiner);
  } catch (error) {
    // Two sign-ups with one email at once: the second finds the address taken.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Der findes allerede en konto med den e-mail. Skriv din nuværende adgangskode." };
    }
    throw error;
  }
  if (!result.ok) return { error: LINK_PROBLEM_TEXT[result.problem] };

  await clearAttempts("join", email);
  await createSession(result.userId, existing?.tokenVersion ?? 0);
  redirect("/oversigt");
}

/** Somebody already logged in joins the link's team with one press. */
export async function joinWithLinkAsMe(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const link = await findInviteLink(String(formData.get("token") ?? ""));
  const problem = linkProblem(link);
  if (!link || problem) return { error: LINK_PROBLEM_TEXT[problem ?? "unknown"] };
  const result = await redeemInviteLink(link.id, { userId: user.id });
  if (!result.ok) return { error: LINK_PROBLEM_TEXT[result.problem] };
  revalidatePath("/", "layout");
  redirect("/oversigt");
}
