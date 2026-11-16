import { requireTeamUser } from "@/lib/auth";
import { ActivityScreen } from "@/components/activity-screen";

export default async function ActivityFinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActivityScreen user={await requireTeamUser()} id={id} show="/boder" />;
}
