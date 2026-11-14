import { describe, expect, it } from "vitest";
import { rightState, roleAfterToggle } from "@/lib/role-stack";

describe("the role stack in the members table", () => {
  it("ticks Bøder for a bødekasseformand and both for an admin, Bøder only implied", () => {
    expect(rightState("PLAYER", "fines")).toEqual({ checked: false, implied: false });
    expect(rightState("PLAYER", "admin")).toEqual({ checked: false, implied: false });
    expect(rightState("TREASURER", "fines")).toEqual({ checked: true, implied: false });
    expect(rightState("TREASURER", "admin")).toEqual({ checked: false, implied: false });
    expect(rightState("ADMIN", "fines")).toEqual({ checked: true, implied: true });
    expect(rightState("ADMIN", "admin")).toEqual({ checked: true, implied: false });
  });

  it("climbs to the ticked step and goes one down when the top is unticked", () => {
    expect(roleAfterToggle("PLAYER", "fines")).toBe("TREASURER");
    expect(roleAfterToggle("PLAYER", "admin")).toBe("ADMIN");
    expect(roleAfterToggle("TREASURER", "admin")).toBe("ADMIN");
    expect(roleAfterToggle("TREASURER", "fines")).toBe("PLAYER");
    expect(roleAfterToggle("ADMIN", "admin")).toBe("TREASURER");
  });

  it("does not take Bøder from an admin on its own", () => {
    expect(roleAfterToggle("ADMIN", "fines")).toBe("ADMIN");
  });
});
