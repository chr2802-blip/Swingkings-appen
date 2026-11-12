import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { changePassword, updateProfile } from "@/app/actions/profile";
import { PHOTO_FIELD, TEST_PASSWORD, formData, makeMember, makePhoto, makeTeam, makeUser, signIn } from "../helpers/factories";
import { cookieStore, SESSION_COOKIE_NAME } from "../helpers/next-mocks";
import { expectRedirectToLogin } from "../helpers/expect";

describe("updateProfile", () => {
  it("renames, and sets and clears the picture", async () => {
    const team = await makeTeam();
    const anna = await makeMember(team.id, "Anna");
    const photo = await makePhoto(team.id);
    await signIn(anna);

    expect(await updateProfile(undefined, formData({ name: " Anna B ", [PHOTO_FIELD]: photo.id }))).toEqual({ ok: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: anna.id } })).toMatchObject({ name: "Anna B", photoId: photo.id });

    await updateProfile(undefined, formData({ name: "Anna B", [PHOTO_FIELD]: "" }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: anna.id } })).photoId).toBeNull();
  });

  it("leaves the picture alone when the form has no picture field", async () => {
    const team = await makeTeam();
    const anna = await makeMember(team.id, "Anna");
    const photo = await makePhoto(team.id);
    await prisma.user.update({ where: { id: anna.id }, data: { photoId: photo.id } });
    await signIn(anna);
    await updateProfile(undefined, formData({ name: "Anna" }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: anna.id } })).photoId).toBe(photo.id);
  });

  it("refuses an empty name and another team's picture", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Andre");
    const anna = await makeMember(team.id, "Anna");
    const foreign = await makePhoto(other.id);
    await signIn(anna);
    expect(await updateProfile(undefined, formData({ name: "  " }))).toEqual({ ok: false, error: "Skriv dit navn." });
    expect(await updateProfile(undefined, formData({ name: "Anna", [PHOTO_FIELD]: foreign.id }))).toEqual({
      ok: false,
      error: "Billedet findes ikke længere.",
    });
  });

  it("works for somebody on no team, without a picture", async () => {
    const loner = await makeUser();
    await signIn(loner);
    expect(await updateProfile(undefined, formData({ name: "Ny" }))).toEqual({ ok: true });
  });

  it("needs a session", async () => {
    await expectRedirectToLogin(() => updateProfile(undefined, formData({ name: "x" })));
  });
});

describe("changePassword", () => {
  it("changes it, keeps this device signed in and ends every other session", async () => {
    const user = await makeUser();
    await signIn(user);
    const oldCookie = cookieStore.get(SESSION_COOKIE_NAME)!;

    const result = await changePassword(undefined, formData({ current: TEST_PASSWORD, next: "et-helt-nyt-kodeord" }));
    expect(result).toEqual({ ok: true, note: "Adgangskoden er skiftet. Du er logget ud alle andre steder." });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("et-helt-nyt-kodeord", row.passwordHash)).toBe(true);
    expect((await getCurrentUser())?.id).toBe(user.id);

    cookieStore.set(SESSION_COOKIE_NAME, oldCookie);
    expect(await getCurrentUser()).toBeNull();
  });

  it("refuses a wrong current password and a short new one", async () => {
    const user = await makeUser();
    await signIn(user);
    expect(await changePassword(undefined, formData({ current: "forkert", next: "et-helt-nyt-kodeord" }))).toEqual({
      ok: false,
      error: "Den nuværende adgangskode er forkert.",
    });
    expect(await changePassword(undefined, formData({ current: TEST_PASSWORD, next: "kort" }))).toEqual({
      ok: false,
      error: "Den nye adgangskode skal være mindst 8 tegn.",
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion).toBe(0);
  });
});
