import type { ChallengeStatus } from "@prisma/client";
import { Badge, Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ActionButton } from "@/components/action-button";
import { moveChallenge } from "@/app/actions/fines";
import { CHALLENGE_STATUS_LABEL, movesFor } from "@/lib/challenges";
import { fineUnits, kr } from "@/lib/money";
import { relativeDay } from "@/lib/time";

type Person = { id: string; name: string; photoId: string | null };

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

const TONE: Record<ChallengeStatus, "amber" | "neutral" | "green"> = {
  PENDING: "amber",
  SETTLED: "green",
  CANCELLED: "neutral",
};

/** The `include` a page needs to draw a `ChallengeCard`. */
export const challengeCardInclude = {
  winner: { select: { id: true, name: true, photoId: true } },
  loser: { select: { id: true, name: true, photoId: true } },
  reportedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  match: { select: { opponent: true, title: true } },
} as const;

/** One challenge, with exactly the buttons `movesFor` allows the viewer. */
export function ChallengeCard({
  challenge: c,
  viewerId,
  managesFines,
  finePriceKr,
  children,
}: {
  challenge: ChallengeView;
  viewerId: string;
  managesFines: boolean;
  finePriceKr: number;
  /** More about the challenge, drawn at the foot of the same card (a fine's own facts). */
  children?: React.ReactNode;
}) {
  const moves = movesFor(c, viewerId, managesFines);
  const fields = (move: string) => ({ id: c.id, move });

  return (
    <Card className="space-y-3">
      <div>
        <Badge tone={TONE[c.status]}>{CHALLENGE_STATUS_LABEL[c.status]}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Side person={c.winner} won />
        <span className="shrink-0 text-xs font-semibold text-slate-400">slog</span>
        <Side person={c.loser} won={false} />
      </div>
      <p className="font-medium">“{c.description}”</p>
      <p className="text-xs text-slate-500">
        {fineUnits(c.units)} ({kr(c.units * finePriceKr)}) · meldt af {c.reportedBy.name} · {relativeDay(c.createdAt)}
        {c.match && ` · ${c.match.opponent ?? c.match.title}`}
      </p>

      {c.status === "SETTLED" && (
        <p className="text-sm">
          {fineUnits(c.units)} flyttet fra {c.winner.name} til {c.loser.name}
          {c.approvedBy && ` · godkendt af ${c.approvedBy.name}`}.
        </p>
      )}
      {c.status === "PENDING" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {moves.includes("approve")
            ? `Godkend, så flytter ${fineUnits(c.units)} fra ${c.winner.name} til ${c.loser.name}.`
            : "Venter på at en anden på holdet godkender."}
        </p>
      )}

      {moves.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {moves.includes("approve") && <ActionButton action={moveChallenge} fields={fields("approve")} label="Godkend" variant="primary" />}
          {moves.includes("cancel") && <ActionButton action={moveChallenge} fields={fields("cancel")} label="Træk tilbage" variant="ghost" />}
        </div>
      )}
      {children}
    </Card>
  );
}

function Side({ person, won }: { person: Person; won: boolean }) {
  return (
    <PlayerLink userId={person.id} className="flex min-w-0 items-center gap-1.5">
      <Avatar name={person.name} photoId={person.photoId} size="xs" />
      <span className={`truncate text-sm ${won ? "font-semibold" : ""}`}>
        {person.name}
        {won && " 🏆"}
      </span>
    </PlayerLink>
  );
}
