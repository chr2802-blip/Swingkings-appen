import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { discardReplaced, readPhotoChoice, readPhotoChoices, storePhoto, sweepUnclaimedPhotos } from "@/lib/photos";
import { POST as upload } from "@/app/api/photos/route";
import { GET as serve } from "@/app/api/photos/[id]/route";
import { PHOTO_FIELD, formData, joinTeam, makeMember, makePhoto, makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";
import { jpegBytes, pngBytes } from "../helpers/images";

const request = (parts: Record<string, Uint8Array | string>) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(parts)) {
    body.append(name, typeof value === "string" ? value : new File([value as Uint8Array<ArrayBuffer>], `${name}.bin`));
  }
  return new Request("http://localhost/api/photos", { method: "POST", body });
};

const fetchPhoto = (id: string, thumb = false) =>
  serve(new Request(`http://localhost/api/photos/${id}${thumb ? "?size=thumb" : ""}`), { params: Promise.resolve({ id }) });

describe("storePhoto", () => {
  it("measures the bytes themselves and files the picture under the team", async () => {
    const team = await makeTeam();
    const stored = await storePhoto(team.id, jpegBytes(800, 600), pngBytes(80, 60));
    expect(stored.ok).toBe(true);
    const row = await prisma.photo.findUniqueOrThrow({ where: { id: (stored as { id: string }).id } });
    expect(row).toMatchObject({ teamId: team.id, contentType: "image/jpeg", width: 800, height: 600, thumbWidth: 80, thumbHeight: 60 });
  });

  it("refuses a file that is not a picture, and one too large in pixels", async () => {
    const team = await makeTeam();
    expect(await storePhoto(team.id, new TextEncoder().encode("<svg/>"), pngBytes())).toEqual({ ok: false, error: "Billedet skal være JPEG, PNG eller WebP." });
    expect(await storePhoto(team.id, pngBytes(5000, 10), pngBytes())).toEqual({ ok: false, error: "Billedet har for mange pixels." });
    expect(await storePhoto(team.id, pngBytes(), new Uint8Array())).toEqual({ ok: false, error: "Billedet er tomt." });
    expect(await prisma.photo.count()).toBe(0);
  });
});

describe("choosing pictures in a form", () => {
  it("tells apart no field, a cleared field and a picture, and never finds another team's", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Andre");
    const mine = await makePhoto(team.id);
    const theirs = await makePhoto(other.id);
    expect(await readPhotoChoice(formData({}), team.id)).toEqual({ ok: true, photoId: undefined });
    expect(await readPhotoChoice(formData({ [PHOTO_FIELD]: " " }), team.id)).toEqual({ ok: true, photoId: null });
    expect(await readPhotoChoice(formData({ [PHOTO_FIELD]: mine.id }), team.id)).toEqual({ ok: true, photoId: mine.id });
    expect((await readPhotoChoice(formData({ [PHOTO_FIELD]: theirs.id }), team.id)).ok).toBe(false);

    expect(await readPhotoChoices(formData({ [PHOTO_FIELD]: [mine.id, mine.id] }), team.id, 10)).toEqual({ ok: true, photoIds: [mine.id] });
    expect(await readPhotoChoices(formData({}), team.id, 10)).toEqual({ ok: true, photoIds: [] });
  });

  it("throws away only a picture actually replaced", async () => {
    const team = await makeTeam();
    const old = await makePhoto(team.id);
    await discardReplaced(team.id, old.id, undefined);
    await discardReplaced(team.id, old.id, old.id);
    expect(await prisma.photo.count()).toBe(1);
    await discardReplaced(team.id, old.id, null);
    expect(await prisma.photo.count()).toBe(0);
  });

  it("sweeps uploads older than an hour that nothing points at", async () => {
    const { team, anna } = await makeSquad();
    const hourAgo = new Date(Date.now() - 61 * 60 * 1000);
    const abandoned = await makePhoto(team.id, { createdAt: hourAgo });
    const fresh = await makePhoto(team.id);
    const avatar = await makePhoto(team.id, { createdAt: hourAgo });
    const inChat = await makePhoto(team.id, { createdAt: hourAgo });
    await prisma.user.update({ where: { id: anna.id }, data: { photoId: avatar.id } });
    await prisma.chatMessage.create({ data: { teamId: team.id, authorId: anna.id, body: "", photoId: inChat.id } });

    expect(await sweepUnclaimedPhotos(team.id)).toBe(1);
    expect((await prisma.photo.findMany({ select: { id: true } })).map((p) => p.id).sort()).toEqual([fresh.id, avatar.id, inChat.id].sort());
    expect(await prisma.photo.count({ where: { id: abandoned.id } })).toBe(0);
  });
});

describe("POST /api/photos", () => {
  it("stores an upload and answers with its id", async () => {
    const { team, anna } = await makeSquad();
    await signIn(anna);
    const response = await upload(request({ photo: jpegBytes(400, 300), thumb: pngBytes(40, 30) }));
    expect(response.status).toBe(200);
    const { id } = await response.json();
    expect((await prisma.photo.findUniqueOrThrow({ where: { id } })).teamId).toBe(team.id);
  });

  it("refuses the signed-out, a missing part and a file that is not a picture", async () => {
    expect((await upload(request({ photo: pngBytes(), thumb: pngBytes() }))).status).toBe(401);
    const { anna } = await makeSquad();
    await signIn(anna);
    expect((await upload(request({ photo: pngBytes() }))).status).toBe(400);
    expect((await upload(request({ photo: "tekst", thumb: pngBytes() }))).status).toBe(400);
    const bad = await upload(request({ photo: new TextEncoder().encode("GIF89a........................"), thumb: pngBytes() }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Billedet skal være JPEG, PNG eller WebP." });
    expect((await upload(new Request("http://localhost/api/photos", { method: "POST", body: "x" }))).status).toBe(400);
  });

  it("stops at sixty uploads a quarter of an hour", async () => {
    const { anna } = await makeSquad();
    await signIn(anna);
    for (let i = 0; i < 60; i++) await upload(request({ photo: pngBytes(), thumb: pngBytes() }));
    expect((await upload(request({ photo: pngBytes(), thumb: pngBytes() }))).status).toBe(429);
  }, 30_000);
});

describe("GET /api/photos/<id>", () => {
  it("serves the team's picture and its thumbnail, privately and for a year", async () => {
    const { team, anna } = await makeSquad();
    const photo = await makePhoto(team.id);
    await signIn(anna);
    const full = await fetchPhoto(photo.id);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/png");
    expect(full.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(new Uint8Array(photo.bytes));
    expect(new Uint8Array(await (await fetchPhoto(photo.id, true)).arrayBuffer())).toEqual(new Uint8Array(photo.thumbBytes));
  });

  it("answers 404 to the signed-out, to another team and to an id that never was", async () => {
    const { team } = await makeSquad();
    const outsider = await makeSquad("Andre");
    const photo = await makePhoto(team.id);
    expect((await fetchPhoto(photo.id)).status).toBe(404);
    await signIn(outsider.anna);
    expect((await fetchPhoto(photo.id)).status).toBe(404);
    expect((await fetchPhoto("findes-ikke")).status).toBe(404);
  });

  it("serves a person's own picture to anybody who shares a team with them", async () => {
    const first = await makeTeam("Første");
    const second = await makeTeam("Anden");
    const anna = await makeMember(first.id, "Anna");
    await joinTeam(anna.id, second.id);
    const bo = await makeMember(second.id, "Bo");
    const avatar = await makePhoto(first.id);
    await prisma.user.update({ where: { id: anna.id }, data: { photoId: avatar.id } });
    await signIn(bo);
    expect((await fetchPhoto(avatar.id)).status).toBe(200);

    await signIn(await makeUser());
    expect((await fetchPhoto(avatar.id)).status).toBe(404);
  });
});
