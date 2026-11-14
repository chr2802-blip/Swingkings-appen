import { teamDb } from "./team-db";

/** How many messages the chat shows at once. */
export const CHAT_PAGE = 60;

export type ChatItem = {
  id: string;
  body: string;
  /** Its pictures, in the order they were chosen. */
  photoIds: string[];
  createdAt: string;
  author: { id: string; name: string; photoId: string | null };
};

/** The latest messages, oldest first, as the chat page and `/api/chat` both draw them. */
export async function latestMessages(teamId: string): Promise<ChatItem[]> {
  const rows = await teamDb(teamId).chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: CHAT_PAGE,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true, photoId: true } },
      photos: { orderBy: { position: "asc" }, select: { photoId: true } },
    },
  });
  return rows.reverse().map(({ photos, ...row }) => ({
    ...row,
    photoIds: photos.map((photo) => photo.photoId),
    createdAt: row.createdAt.toISOString(),
  }));
}
