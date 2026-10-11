import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { latestMessages } from "@/lib/chat";
import { ChatRoom } from "@/components/chat-room";

export default async function ChatPage() {
  const user = await requireTeamUser();
  const messages = await latestMessages(user.teamId);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Chat</h1>
      <ChatRoom initial={messages} viewerId={user.id} canModerate={canAdministerTeam(user, user.teamId)} />
    </div>
  );
}
