import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { teamDb } from "@/lib/team-db";
import { foundOr404 } from "@/lib/scoped";
import { teamRoster } from "@/lib/roster";
import { taskUrl } from "@/lib/tasks";
import { PageHeader } from "@/components/ui";
import { TaskDetails } from "@/components/task-details";
import { TASK_SELECT } from "@/components/task-row";

/**
 * A job's old address — notifications, the chat and the front page link here. A job on an
 * activity opens in its sheet over the activity's "Opgaver" tab; only an old job with no
 * activity is still drawn as a page of its own.
 */
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTeamUser();
  const task = await foundOr404(teamDb(user.teamId).task.findFirst({ where: { id }, select: TASK_SELECT }));
  if (task.match) redirect(taskUrl({ id: task.id, matchId: task.match.id }));
  const roster = await teamRoster(user.teamId);

  return (
    <div>
      <PageHeader title={task.title} />
      <TaskDetails task={task} user={user} members={roster} />
    </div>
  );
}
