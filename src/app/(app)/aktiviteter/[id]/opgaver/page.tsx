import { requireTeamUser } from "@/lib/auth";
import { ActivityScreen } from "@/components/activity-screen";
import { OPEN_TASK_PARAM } from "@/lib/tasks";

export default async function ActivityTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const open = (await searchParams)[OPEN_TASK_PARAM];
  return (
    <ActivityScreen user={await requireTeamUser()} id={id} show="/opgaver" openTaskId={typeof open === "string" ? open : undefined} />
  );
}
