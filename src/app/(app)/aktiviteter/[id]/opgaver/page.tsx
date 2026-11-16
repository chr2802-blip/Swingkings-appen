import { requireTeamUser } from "@/lib/auth";
import { ActivityScreen } from "@/components/activity-screen";

export default async function ActivityTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActivityScreen user={await requireTeamUser()} id={id} show="/opgaver" />;
}
