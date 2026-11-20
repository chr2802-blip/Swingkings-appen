import type { ChallengeStatus } from "@prisma/client";
import type { TeamUser } from "@/lib/auth";
import { canAdministerTeam, canManageFines } from "@/lib/access";
import { CHALLENGE_STATUS_LABEL, movesFor } from "@/lib/challenges";
import { fineUnits, kr } from "@/lib/money";
import { readInZone } from "@/lib/time";
import { Badge } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { moveChallenge } from "@/app/actions/fines";

type Person = { id: string; name: string; photoId: string | null };

/** What a challenge's sheet shows (`ChallengeDetails`, and a challenge's fine in `FineDetails`). */
export type ChallengeView = {
  id: string;
  description: string;
  units: number;
  status: ChallengeStatus;
  createdAt: Date;
  reportedById: string;
  winner: Person;
  loser: Person;
  reportedBy: { name: string };
  approvedBy: { name: string } | null;
  match: { opponent: string | null; title: string } | null;
};

/** The `include` that reads a `ChallengeView`: only when its sheet is opened. */
export const challengeDetailsInclude = {
  winner: { select: { id: true, name: true, photoId: true } },
  loser: { select: { id: true, name: true, photoId: true } },
  reportedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  match: { select: { opponent: true, title: true } },
} as const;

const TONE: Record<ChallengeStatus, "amber" | "green"> = {
  PENDING: "amber",
  SETTLED: "green",
};

/** Label and value, as every detail sheet lists them (a fine's, a challenge's). */
export type DetailRow = [string, React.ReactNode];

/** The facts of a detail sheet, in the rounded box every sheet draws them in. */
export function DetailRows({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3 px-4 py-2.5 text-sm">
          <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
          <dd className="min-w-0 flex-1 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What a challenge was, as rows: what, who won, who lost, the stake, who reported and approved it. */
export function challengeRows(c: ChallengeView, finePriceKr: number): DetailRow[] {
  const rows: DetailRow[] = [
    ["Udfordring", `“${c.description}”`],
    ["Vinder", <PlayerLink key="winner" userId={c.winner.id}>{c.winner.name} 🏆</PlayerLink>],
    ["Taber", <PlayerLink key="loser" userId={c.loser.id}>{c.loser.name}</PlayerLink>],
    ["Indsats", `${fineUnits(c.units)} (${kr(c.units * finePriceKr)})`],
    ["Status", <Badge key="status" tone={TONE[c.status]}>{CHALLENGE_STATUS_LABEL[c.status]}</Badge>],
    ["Meldt af", c.reportedBy.name],
  ];
  if (c.approvedBy) rows.push(["Godkendt af", c.approvedBy.name]);
  if (c.match) rows.push(["Aktivitet", c.match.opponent ?? c.match.title]);
  return rows;
}

/**
 * Everything known about a challenge still waiting — the sheet behind its row in the
 * history, fetched when it is opened — laid out as a fine's: who, the facts, and at the
 * foot exactly the buttons `movesFor` allows the viewer.
 */
export function ChallengeDetails({ challenge: c, user, finePriceKr }: { challenge: ChallengeView; user: TeamUser; finePriceKr: number }) {
  const moves = movesFor(c, user.id, {
    managesFines: canManageFines(user, user.teamId),
    administers: canAdministerTeam(user, user.teamId),
  });
  const rows = challengeRows(c, finePriceKr);
  rows.push(["Hvornår", readInZone(c.createdAt, "EEEE d. MMMM yyyy 'kl.' HH:mm")]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PlayerLink userId={c.winner.id} press="icon" className="block shrink-0" aria-label={c.winner.name}>
          <Avatar name={c.winner.name} photoId={c.winner.photoId} size="lg" />
        </PlayerLink>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">
            <PlayerLink userId={c.winner.id} className="max-w-full truncate align-top">
              {c.winner.name}
            </PlayerLink>{" "}
            🏆
          </p>
          <p className="truncate text-sm text-slate-600">
            slog <PlayerLink userId={c.loser.id}>{c.loser.name}</PlayerLink>
          </p>
        </div>
      </div>

      <DetailRows rows={rows} />

      {c.status === "PENDING" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {moves.includes("approve")
            ? `Godkend, så flytter ${fineUnits(c.units)} fra ${c.winner.name} til ${c.loser.name}.`
            : "Venter på at en anden på holdet godkender."}
        </p>
      )}

      {moves.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {/* Approved, the history shows the two fines it moved, pulsing. */}
          {moves.includes("approve") && (
            <ActionButton action={moveChallenge} fields={{ id: c.id, move: "approve" }} label="Godkend" variant="primary" showMade />
          )}
          {moves.includes("cancel") && (
            <ActionButton
              action={moveChallenge}
              fields={{ id: c.id, move: "cancel" }}
              label="Træk tilbage"
              variant="danger"
              confirm="Træk udfordringen tilbage? Den bliver slettet."
              confirmLabel="Træk tilbage"
            />
          )}
        </div>
      )}
    </div>
  );
}
