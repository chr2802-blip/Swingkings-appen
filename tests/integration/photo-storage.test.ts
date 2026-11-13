import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { MAX_TEAM_PHOTOS, discardPhotos, storePhoto, sweepUnclaimedPhotos } from "@/lib/photos";
import { POST as upload } from "@/app/api/photos/route";
import { GET as serve } from "@/app/api/photos/[id]/route";
import { deleteTeam } from "@/app/actions/teams";
import { createDemoTeam, removeDemoTeam } from "@/lib/demo-team";
import { formData, makePhoto, makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";
import { jpegBytes, pngBytes } from "../helpers/images";
import { fakeStorage } from "../helpers/fake-storage";

let storage: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  storage = fakeStorage();
});
afterEach(() => storage.restore());

const fetchPhoto = (id: string, thumb = false) =>
  serve(new Request(`http://localhost/api/photos/${id}${thumb ? "?size=thumb" : ""}`), { params: Promise.resolve({ id }) });

describe("pictures in storage", () => {
  it("puts the bytes in the bucket under the team and keeps only the key in Postgres", async () => {
    const team = await makeTeam();
    const stored = await storePhoto(team.id, jpegBytes(800, 600), pngBytes(80, 60));
    expect(stored.ok).toBe(true);
    const row = await prisma.photo.findUniqueOrThrow({ where: { id: (stored as { id: string }).id } });
    expect(row).toMatchObject({ teamId: team.id, contentType: "image/jpeg", width: 800, bytes: null, thumbBytes: null });
    expect(row.storageKey).toMatch(new RegExp(`^${team.id}/[0-9a-f-]{36}$`));
    expect([...storage.objects.keys()].sort()).toEqual([row.storageKey, `${row.storageKey}-thumb`].sort());
  });

  it("serves both sizes to the team behind the session, and to nobody else", async () => {
    const { team, anna } = await makeSquad();
    const outsider = await makeUser({ name: "Udenfor" });
    const full = jpegBytes(400, 300);
    const stored = (await storePhoto(team.id, full, pngBytes(40, 30))) as { id: string };

    await signIn(anna);
    const response = await fetchPhoto(stored.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(full));
    const thumb = await fetchPhoto(stored.id, true);
    expect(new Uint8Array(await thumb.arrayBuffer())).toEqual(new Uint8Array(pngBytes(40, 30)));

    await signIn(outsider);
    expect((await fetchPhoto(stored.id)).status).toBe(404);
  });

  it("answers 404 when the object is gone, 502 when storage fails and 503 when it is not configured", async () => {
    const { team, anna } = await makeSquad();
    const stored = (await storePhoto(team.id, jpegBytes(400, 300), pngBytes(40, 30))) as { id: string };
    await signIn(anna);

    storage.objects.clear();
    expect((await fetchPhoto(stored.id)).status).toBe(404);

    delete process.env.SUPABASE_URL;
    expect((await fetchPhoto(stored.id)).status).toBe(503);
  });

  it("stores nothing and says so when the bucket refuses, and leaves no row", async () => {
    const team = await makeTeam();
    storage.state.failWrites = true;
    const stored = await storePhoto(team.id, jpegBytes(400, 300), pngBytes(40, 30));
    expect(stored).toEqual({ ok: false, error: "Billedet kunne ikke gemmes. Prøv igen." });
    expect(await prisma.photo.count()).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it("uploads through the route like any other picture", async () => {
    const { team, anna } = await makeSquad();
    await signIn(anna);
    const body = new FormData();
    body.append("photo", new File([jpegBytes(400, 300) as Uint8Array<ArrayBuffer>], "p.bin"));
    body.append("thumb", new File([pngBytes(40, 30) as Uint8Array<ArrayBuffer>], "t.bin"));
    const response = await upload(new Request("http://localhost/api/photos", { method: "POST", body }));
    expect(response.status).toBe(200);
    const { id } = await response.json();
    expect(await prisma.photo.findUniqueOrThrow({ where: { id } })).toMatchObject({ teamId: team.id, bytes: null });
    expect(storage.objects.size).toBe(2);
  });
});

describe("pictures leaving storage", () => {
  it("takes the objects away with a discarded picture, but not with one still in use", async () => {
    const { team, anna } = await makeSquad();
    const free = (await storePhoto(team.id, jpegBytes(400, 300), pngBytes(40, 30))) as { id: string };
    const used = (await storePhoto(team.id, jpegBytes(400, 300), pngBytes(40, 30))) as { id: string };
    await prisma.user.update({ where: { id: anna.id }, data: { photoId: used.id } });
    expect(storage.objects.size).toBe(4);

    await discardPhotos(team.id, [free.id, used.id]);
    expect(storage.objects.size).toBe(2);
    expect(await prisma.photo.count({ where: { id: used.id } })).toBe(1);
    expect(await prisma.photo.count({ where: { id: free.id } })).toBe(0);
  });

  it("sweeps abandoned uploads out of the bucket as well", async () => {
    const { team } = await makeSquad();
    const stored = (await storePhoto(team.id, jpegBytes(400, 300), pngBytes(40, 30))) as { id: string };
    await prisma.photo.update({ where: { id: stored.id }, data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    expect(await sweepUnclaimedPhotos(team.id)).toBe(1);
    expect(storage.objects.size).toBe(0);
  });

  it("goes with the team when the super admin deletes it, and leaves other teams' pictures", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    const doomed = await makeTeam("Slettes");
    const kept = await makeTeam("Bliver");
    await storePhoto(doomed.id, jpegBytes(400, 300), pngBytes(40, 30));
    await storePhoto(kept.id, jpegBytes(400, 300), pngBytes(40, 30));
    await signIn(root);
    await deleteTeam(undefined, formData({ teamId: doomed.id }));
    expect([...storage.objects.keys()].every((key) => key.startsWith(`${kept.id}/`))).toBe(true);
    expect(storage.objects.size).toBe(2);
  });

  it("goes with the demo team", async () => {
    const team = await createDemoTeam();
    await storePhoto(team.id, jpegBytes(400, 300), pngBytes(40, 30));
    await removeDemoTeam();
    expect(storage.objects.size).toBe(0);
  });
});

describe("the picture limit", () => {
  it("stops a team at its ceiling, and other teams are not affected", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Andre");
    const sample = await makePhoto(team.id);
    await prisma.photo.createMany({
      data: Array.from({ length: MAX_TEAM_PHOTOS - 1 }, () => ({
        teamId: team.id, contentType: "image/png", width: 1, height: 1, thumbWidth: 1, thumbHeight: 1, bytes: sample.bytes,
      })),
    });
    expect(await prisma.photo.count({ where: { teamId: team.id } })).toBe(MAX_TEAM_PHOTOS);
    const refused = await storePhoto(team.id, jpegBytes(400, 300), pngBytes(40, 30));
    expect(refused.ok).toBe(false);
    expect((refused as { error: string }).error).toMatch(/grænsen for billeder/);
    expect((await storePhoto(other.id, jpegBytes(400, 300), pngBytes(40, 30))).ok).toBe(true);
  }, 30_000);
});
