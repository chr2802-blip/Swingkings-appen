import { describe, expect, it } from "vitest";
import { classifyModels } from "@/lib/team-db";

describe("teamDb", () => {
  it("knows what to do with every model in the schema", () => {
    // Throws, naming the model, for one nobody has classified.
    const verdicts = classifyModels();
    expect(verdicts.length).toBeGreaterThan(10);
  });

  it("scopes everything carrying a team and refuses what only reads like it does", () => {
    const verdict = Object.fromEntries(classifyModels().map((m) => [m.model, m.verdict]));
    for (const model of ["Fine", "Payment", "Challenge", "Match", "Task", "ChatMessage", "Post", "Photo", "TeamMember"]) {
      expect(verdict[model]).toBe("scope");
    }
    for (const model of ["User", "TaskAssignee", "PostLike", "PostComment"]) {
      expect(verdict[model]).toBe("refuse");
    }
  });
});
