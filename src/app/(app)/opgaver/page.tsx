import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { teamRoster } from "@/lib/roster";
import { upcomingMatchOptions } from "@/lib/match-data";
import { DONE_TASK, OPEN_TASK, taskCandidates } from "@/lib/tasks";
import { Card, EmptyState, PageHeader, SectionTitle, Tabs } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { TaskDialog } from "@/components/task-dialog";

type Search = { vis?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { vis } = await searchParams;
  const view = vis === "alle" ? "alle" : vis === "udfort" ? "udfort" : "mine";
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const admin = canAdministerTeam(user, user.teamId);

  const where =
    view === "mine"
      ? { ...OPEN_TASK, assignees: { some: { userId: user.id } } }
      : view === "alle"
        ? OPEN_TASK
        : DONE_TASK;

  const [tasks, roster, matches, candidates] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: view === "udfort" ? { doneAt: "desc" } : [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: view === "udfort" ? 40 : 200,
      select: TASK_SELECT,
    }),
    teamRoster(user.teamId),
    upcomingMatchOptions(user.teamId),
    taskCandidates(user.teamId),
  ]);
  const unassigned = view === "mine" ? await db.task.count({ where: { ...OPEN_TASK, assignees: { none: {} } } }) : 0;

  const loads = roster
    .filter((m) => m.takesTasks)
    .map((m) => ({ ...m, load: candidates.find((c) => c.userId === m.userId)?.load ?? 0 }))
    .sort((a, b) => b.load - a.load || a.name.localeCompare(b.name, "da"));
  const maxLoad = Math.max(1, ...loads.map((m) => m.load));

  return (
    <div>
      <PageHeader
        title="Opgaver"
        description="Opgaver til kampene og alt det andet, der skal gøres."
        action={<TaskDialog members={roster} matches={matches} />}
      />
      <Tabs
        current={`/opgaver${view === "mine" ? "" : `?vis=${view}`}`}
        items={[
          { href: "/opgaver", label: "Mine" },
          { href: "/opgaver?vis=alle", label: "Alle åbne" },
          { href: "/opgaver?vis=udfort", label: "Udført" },
          ...(admin ? [{ href: "/opgaver/standard", label: "Standardopgaver" }] : []),
        ]}
      />

      {unassigned > 0 && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {unassigned === 1 ? "1 opgave" : `${unassigned} opgaver`} har ingen endnu — se under “Alle åbne”.
        </p>
      )}

      {tasks.length === 0 ? (
        <EmptyState icon={view === "udfort" ? "📭" : "🎉"}>
          {view === "mine" ? "Du har ingen opgaver lige nu." : view === "alle" ? "Alt er gjort!" : "Ingen udførte opgaver endnu."}
        </EmptyState>
      ) : (
        <Card padded={false} className="mb-8">
          <ul className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} viewerId={user.id} />
            ))}
          </ul>
        </Card>
      )}

      {view !== "udfort" && loads.length > 0 && (
        <section>
          <SectionTitle>Fordelingen det seneste år</SectionTitle>
          <Card className="space-y-2">
            {loads.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 text-sm">
                <Avatar name={m.name} photoId={m.photoId} size="xs" />
                <span className="w-32 truncate">{m.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(m.load / maxLoad) * 100}%` }} />
                </span>
                <span className="w-6 text-right text-slate-500">{m.load}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
