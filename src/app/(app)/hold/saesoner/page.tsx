import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { fineUnits, kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { teamSeasons } from "@/lib/season-data";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

/** The summaries of the seasons that have ended, the latest first. For everybody on the team. */
export default async function SeasonsPage() {
  const user = await requireTeamUser();
  const seasons = await teamSeasons(user.teamId);
  const admin = canAdministerTeam(user, user.teamId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tidligere sæsoner"
        action={
          admin && (
            <ButtonLink href="/hold/saeson" variant="secondary">
              Ny sæson
            </ButtonLink>
          )
        }
      />
      {seasons.length === 0 && <EmptyState icon="🏆">Ingen afsluttede sæsoner endnu.</EmptyState>}
      {seasons.map(({ id, name, startedAt, endedAt, summary }) => (
        <Card key={id} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{name}</h2>
            <p className="text-xs text-slate-500">
              {readInZone(startedAt, "d. MMM yyyy")} – {readInZone(endedAt, "d. MMM yyyy")}
            </p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-slate-100 rounded-2xl border border-slate-200 py-2 text-center">
            <Stat label={summary.fines === 1 ? "bøde" : "bøder"} value={String(summary.fines)} />
            <Stat label="i bødekassen" value={kr(summary.kr)} />
            <Stat label={summary.activities === 1 ? "aktivitet" : "aktiviteter"} value={String(summary.activities)} />
          </dl>
          {summary.topFined.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">Sæsonens bødekonger</h3>
              <ol className="space-y-1 text-sm">
                {summary.topFined.map((row, i) => (
                  <li key={row.name} className="flex justify-between gap-3">
                    <span>
                      {["🥇", "🥈", "🥉"][i]} {row.name}
                    </span>
                    <span className="text-slate-500">
                      {fineUnits(row.units)} · {kr(row.kr)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <ul className="space-y-1 text-sm text-slate-700">
            {summary.topReason && (
              <li>
                Mest givne bøde: <strong>{summary.topReason.reason}</strong> ({summary.topReason.count} gange)
              </li>
            )}
            {summary.topChallenger && (
              <li>
                Flest vundne udfordringer: <strong>{summary.topChallenger.name}</strong> ({summary.topChallenger.wins} af{" "}
                {summary.challenges})
              </li>
            )}
            {summary.topWorker && (
              <li>
                Flest løste opgaver: <strong>{summary.topWorker.name}</strong> ({summary.topWorker.tasks} af {summary.tasks})
              </li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <dt className="sr-only">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
      <dd className="text-xs text-slate-500">{label}</dd>
    </div>
  );
}
