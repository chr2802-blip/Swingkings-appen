import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { latestMessages, markChatSeen } from "@/lib/chat";
import { ChatRoom } from "@/components/chat-room";

export default async function ChatPage() {
  const user = await requireTeamUser();
  const [page] = await Promise.all([latestMessages(user.teamId), markChatSeen(user.teamId, user.id)]);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Chat</h1>
      <ChatRoom initial={page} viewerId={user.id} canModerate={canAdministerTeam(user, user.teamId)} />
    </div>
  );
}
