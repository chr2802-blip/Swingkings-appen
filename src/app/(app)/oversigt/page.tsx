import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { teamDb } from "@/lib/team-db";
import { fineBoard } from "@/lib/fine-data";
import { movesFor } from "@/lib/challenges";
import { kr } from "@/lib/money";
import { OPEN_TASK } from "@/lib/tasks";
import { kickoffLabel, relativeDay, startOfDayInZone } from "@/lib/time";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { Photo } from "@/components/photo";
import { TaskRow, TASK_SELECT } from "@/components/task-row";
import { NotificationSetup } from "@/components/notification-setup";

export default async function OverviewPage() {
  const user = await requireTeamUser();
  const db = teamDb(user.teamId);
  const [board, nextMatch, myTasks, openChallenges, posts] = await Promise.all([
    fineBoard(user.teamId),
    db.match.findFirst({
      where: { kind: "MATCH", cancelledAt: null, startsAt: { gte: startOfDayInZone() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, opponent: true, startsAt: true, location: true, isHome: true, tasks: { select: TASK_SELECT } },
    }),
    db.task.findMany({
      where: { ...OPEN_TASK, assignees: { some: { userId: user.id } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 5,
      select: TASK_SELECT,
    }),
    db.challenge.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED"] }, OR: [{ challengerId: user.id }, { opponentId: user.id }] },
      select: { status: true, challengerId: true, opponentId: true, claimedById: true, claimedWinnerId: true },
    }),
    db.post.findMany({
      where: { photoId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, photoId: true },
    }),
  ]);
  const mine = board.balances.find((row) => row.userId === user.id);
  const waitingOnMe = openChallenges.filter((c) => movesFor(c, user.id, false).some((m) => m !== "cancel")).length;
  const topOwers = board.balances.filter((row) => row.owesKr > 0).slice(0, 3);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Hej {firstName} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">Her er det vigtigste på {user.teamName}.</p>
      </div>

      <NotificationSetup compact />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/boder" className="press-card block rounded-2xl">
          <Card className="h-full">
            <SectionTitle>Din bødekonto</SectionTitle>
            <p className={`text-3xl font-semibold ${mine && mine.owesKr > 0 ? "text-red-600" : "text-emerald-700"}`}>
              {kr(Math.max(0, mine?.owesKr ?? 0))}
            </p>
            <p className="text-sm text-slate-500">{mine && mine.owesKr > 0 ? "skylder du til kassen" : "Du skylder ingenting"}</p>
            {topOwers.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Største gæld:{" "}
                {topOwers.map((row) => `${board.people.get(row.userId)?.name.split(" ")[0]} (${kr(row.owesKr)})`).join(", ")}
              </p>
            )}
          </Card>
        </Link>

        <Link href="/boder/udfordringer" className="press-card block rounded-2xl">
          <Card className="h-full">
            <SectionTitle>Udfordringer</SectionTitle>
            <p className="text-3xl font-semibold">{openChallenges.length}</p>
            <p className="text-sm text-slate-500">åbne udfordringer med dig</p>
            {waitingOnMe > 0 && (
              <p className="mt-3">
                <Badge tone="amber">{waitingOnMe} venter på dit svar</Badge>
              </p>
            )}
          </Card>
        </Link>
      </div>

      <section>
        <SectionTitle action={<Link href="/kampe" className="text-sm text-[var(--accent-text)] underline">Alle kampe</Link>}>
          Næste kamp
        </SectionTitle>
        {nextMatch ? (
          <Card padded={false}>
            <Link href={`/kampe/${nextMatch.id}`} className="press-card block px-5 py-4">
              <p className="font-display text-xl">
                {nextMatch.opponent ? `${nextMatch.isHome === false ? "Ude mod" : nextMatch.isHome ? "Hjemme mod" : "Mod"} ${nextMatch.opponent}` : nextMatch.title}
              </p>
              <p className="text-sm text-slate-500">
                {kickoffLabel(nextMatch.startsAt)} · {relativeDay(nextMatch.startsAt)}
                {nextMatch.location && ` · ${nextMatch.location}`}
              </p>
            </Link>
            {nextMatch.tasks.length > 0 && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {nextMatch.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} viewerId={user.id} showMatch={false} />
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card className="text-sm text-slate-500">Ingen kommende kampe i kalenderen.</Card>
        )}
      </section>

      <section>
        <SectionTitle action={<Link href="/opgaver" className="text-sm text-[var(--accent-text)] underline">Alle opgaver</Link>}>
          Dine opgaver
        </SectionTitle>
        {myTasks.length === 0 ? (
          <Card className="text-sm text-slate-500">Du har ingen opgaver lige nu 🎉</Card>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {myTasks.map((task) => (
                <TaskRow key={task.id} task={task} viewerId={user.id} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle action={<Link href="/feed" className="text-sm text-[var(--accent-text)] underline">Til feedet</Link>}>
          Seneste billeder
        </SectionTitle>
        {posts.length === 0 ? (
          <Card className="text-sm text-slate-500">Ingen billeder endnu.</Card>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {posts.map((post) => (
              <Link key={post.id} href="/feed" className="press-card block overflow-hidden rounded-xl">
                <Photo photoId={post.photoId!} alt="" size="thumb" className="aspect-square w-full object-cover" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
