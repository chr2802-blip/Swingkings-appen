import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { markChatSeen, unreadChatCount } from "@/lib/chat";
import { UNREAD_UP_TO } from "@/lib/chat-count";
import { GET as unreadRoute } from "@/app/api/chat/unread/route";
import { GET as chatRoute } from "@/app/api/chat/route";
import { makeSquad, makeTeam, makeUser, signIn } from "../helpers/factories";

const start = new Date("2026-11-01T18:00:00Z");
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

/** A team whose members joined before `start`, and a way to write in its chat. */
async function chatTeam() {
  const squad = await makeSquad();
  await prisma.teamMember.updateMany({ where: { teamId: squad.team.id }, data: { createdAt: at(-3600) } });
  const say = (author: { id: string }, body: string, when: Date, teamId = squad.team.id) =>
    prisma.chatMessage.create({ data: { teamId, authorId: author.id, body, createdAt: when } });
  return { ...squad, say };
}

describe("unreadChatCount", () => {
  it("counts the others' messages since the chat was last open", async () => {
    const { team, anna, bo, say } = await chatTeam();
    await say(bo, "Første", at(0));
    await say(anna, "Mit eget", at(5));
    expect(await unreadChatCount(team.id, bo.id)).toBe(1);
    // Anna's own message reads what came before it.
    expect(await unreadChatCount(team.id, anna.id)).toBe(0);
    await say(bo, "Anden", at(10));
    await say(bo, "Tredje", at(20));
    expect(await unreadChatCount(team.id, anna.id)).toBe(2);
    await markChatSeen(team.id, anna.id, at(30));
    expect(await unreadChatCount(team.id, anna.id)).toBe(0);
  });

  it("does not count what was written before one joined", async () => {
    const { team, bo, say } = await chatTeam();
    await say(bo, "Før", at(0));
    const carl = await makeUser({ name: "Carl" });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: carl.id, createdAt: at(10) } });
    expect(await unreadChatCount(team.id, carl.id)).toBe(0);
  });

  it("counts only this team's chat, and nothing for somebody not on it", async () => {
    const { team, anna, bo, say } = await chatTeam();
    const other = await makeTeam("Anden");
    await say(bo, "Et andet hold", at(0), other.id);
    expect(await unreadChatCount(team.id, anna.id)).toBe(0);
    await say(bo, "Hej", at(1));
    expect(await unreadChatCount(other.id, anna.id)).toBe(0);
  });

  it("stops counting at UNREAD_UP_TO", async () => {
    const { team, anna, bo } = await chatTeam();
    await prisma.chatMessage.createMany({
      data: Array.from({ length: UNREAD_UP_TO + 5 }, (_, i) => ({ teamId: team.id, authorId: bo.id, body: `${i}`, createdAt: at(i) })),
    });
    expect(await unreadChatCount(team.id, anna.id)).toBe(UNREAD_UP_TO);
  });
});

describe("markChatSeen", () => {
  it("writes a message that came in since the last mark down at once, so it is not left unread", async () => {
    const { team, anna, bo, say } = await chatTeam();
    await markChatSeen(team.id, anna.id, at(0));
    await say(bo, "Lige nu", at(2));
    // Within the 15 seconds that would otherwise skip the write.
    await markChatSeen(team.id, anna.id, at(5));
    expect(await unreadChatCount(team.id, anna.id)).toBe(0);
  });

  it("still skips the write when nothing has come in since", async () => {
    const { team, anna } = await chatTeam();
    await markChatSeen(team.id, anna.id, at(0));
    await markChatSeen(team.id, anna.id, at(5));
    const member = await prisma.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: anna.id } });
    expect(member.chatSeenAt).toEqual(at(0));
  });
});

describe("GET /api/chat/unread", () => {
  it("answers the count, uncached, and reading it marks nothing read", async () => {
    const { anna, bo, say } = await chatTeam();
    await say(bo, "Hej", new Date(Date.now() - 1000));
    await signIn(anna);
    const response = await unreadRoute();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ unread: 1 });
    expect(await (await unreadRoute()).json()).toEqual({ unread: 1 });
    // Opening the chat does.
    await chatRoute();
    expect(await (await unreadRoute()).json()).toEqual({ unread: 0 });
  });

  it("refuses the signed-out and the teamless", async () => {
    expect((await unreadRoute()).status).toBe(401);
    await signIn(await makeUser());
    expect((await unreadRoute()).status).toBe(401);
  });
});
