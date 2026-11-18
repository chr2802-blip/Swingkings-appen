import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteClubLogo, saveClubLogo } from "@/app/actions/club-logos";
import { GET } from "@/app/api/club-logos/[id]/route";
import { clubKey, clubKeys, clubLogos, logoUrl, MAX_LOGO_BYTES } from "@/lib/club-logos";
import { formData, makeSquad, makeUser, signIn, signOut } from "../helpers/factories";
import { expectRedirect } from "../helpers/expect";
import { pngBytes } from "../helpers/images";

const logoForm = (name: string, bytes: Uint8Array = pngBytes(64, 64), type = "image/png") => {
  const data = formData({ name });
  data.set("logo", new File([bytes as Uint8Array<ArrayBuffer>], "logo.png", { type }));
  return data;
};
const serve = (id: string) => GET(new Request(`http://localhost/api/club-logos/${id}`), { params: Promise.resolve({ id }) });

describe("a club's name", () => {
  it("is folded, so one club is one club however it is written", () => {
    expect(clubKey("B.93")).toBe("b93");
    expect(clubKey("b 93")).toBe("b93");
    expect(clubKey("Brønshøj BK")).toBe("brønshøjbk");
    expect(clubKey("Fremad Amager")).toBe(clubKey("FREMAD AMAGER"));
  });

  it("is also looked up without a team number", () => {
    expect(clubKeys("Hvidovre IF (2)")).toEqual(["hvidovreif2", "hvidovreif"]);
    expect(clubKeys("Hvidovre IF 2")).toEqual(["hvidovreif2", "hvidovreif"]);
    expect(clubKeys("AB 70")).toEqual(["ab70"]);
    expect(clubKeys("Hvidovre IF")).toEqual(["hvidovreif"]);
  });
});

describe("club logos", () => {
  it("lets the super admin put one in, for every team, and finds it by the opponent's name", async () => {
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    expect(await saveClubLogo(undefined, logoForm("  Hvidovre   IF "))).toEqual({ ok: true, note: "Logoet for Hvidovre IF er gemt." });
    const logo = await prisma.clubLogo.findFirstOrThrow();
    expect(logo).toMatchObject({ key: "hvidovreif", name: "Hvidovre IF", contentType: "image/png", width: 64, height: 64 });

    const found = await clubLogos(["Hvidovre IF", "hvidovre if (2)", "B.93", null]);
    expect(Object.fromEntries(found)).toEqual({ "Hvidovre IF": logoUrl(logo.id), "hvidovre if (2)": logoUrl(logo.id) });
  });

  it("replaces a club's logo with a new row, so its address changes", async () => {
    await signIn(await makeUser({ role: "SUPER_ADMIN" }));
    await saveClubLogo(undefined, logoForm("B.93"));
    const first = await prisma.clubLogo.findFirstOrThrow();
    await saveClubLogo(undefined, logoForm("B93", pngBytes(32, 32)));
    const rows = await prisma.clubLogo.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(first.id);
    expect(rows[0]).toMatchObject({ key: "b93", width: 32 });
  });

  it("refuses no name, no picture, a picture too large and a file that is not one", async () => {
    await signIn(await makeUser({ role: "SUPER_ADMIN" }));
    expect(await saveClubLogo(undefined, logoForm(" . "))).toMatchObject({ ok: false });
    expect(await saveClubLogo(undefined, formData({ name: "B.93" }))).toEqual({ ok: false, error: "Vælg et logo." });
    expect(await saveClubLogo(undefined, logoForm("B.93", new Uint8Array(MAX_LOGO_BYTES + 1)))).toEqual({
      ok: false,
      error: "Logoet er for stort. Højst 300 kB.",
    });
    expect(await saveClubLogo(undefined, logoForm("B.93", new TextEncoder().encode("<svg></svg>"), "image/svg+xml"))).toEqual({
      ok: false,
      error: "Billedet skal være JPEG, PNG eller WebP.",
    });
    expect(await prisma.clubLogo.count()).toBe(0);
  });

  it("is nobody else's to change: a team's admin is sent away", async () => {
    const { admin } = await makeSquad();
    const root = await makeUser({ role: "SUPER_ADMIN" });
    await signIn(root);
    await saveClubLogo(undefined, logoForm("B.93"));
    const logo = await prisma.clubLogo.findFirstOrThrow();

    await signIn(admin);
    await expectRedirect(() => saveClubLogo(undefined, logoForm("Hvidovre IF")), "/oversigt");
    await expectRedirect(() => deleteClubLogo(undefined, formData({ id: logo.id })), "/oversigt");
    expect(await prisma.clubLogo.count()).toBe(1);

    await signIn(root);
    expect(await deleteClubLogo(undefined, formData({ id: logo.id }))).toEqual({ ok: true });
    expect(await prisma.clubLogo.count()).toBe(0);
  });

  it("is served to anybody signed in, on any team, and to nobody signed out", async () => {
    await signIn(await makeUser({ role: "SUPER_ADMIN" }));
    const bytes = pngBytes(16, 16);
    await saveClubLogo(undefined, logoForm("B.93", bytes));
    const logo = await prisma.clubLogo.findFirstOrThrow();

    const { anna } = await makeSquad("Et helt andet hold");
    await signIn(anna);
    const response = await serve(logo.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect((await serve("findes-ikke")).status).toBe(404);

    signOut();
    expect((await serve(logo.id)).status).toBe(404);
  });
});
