import type { ChallengeStatus } from "@prisma/client";
import { Badge, Card } from "@/components/ui";
import { Avatar } from "@/components/photo";
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
  challengerId: string;
  opponentId: string;
  claimedById: string | null;
  claimedWinnerId: string | null;
  winnerId: string | null;
  challenger: Person;
  opponent: Person;
  match: { opponent: string | null; title: string } | null;
};

const TONE: Record<ChallengeStatus, "amber" | "accent" | "neutral" | "green"> = {
  PENDING: "amber",
  ACCEPTED: "accent",
  DECLINED: "neutral",
  CANCELLED: "neutral",
  SETTLED: "green",
};

/** One challenge, with exactly the buttons `movesFor` allows the viewer. */
export function ChallengeCard({
  challenge: c,
  viewerId,
  managesFines,
  finePriceKr,
}: {
  challenge: ChallengeView;
  viewerId: string;
  managesFines: boolean;
  finePriceKr: number;
}) {
  const moves = movesFor(c, viewerId, managesFines);
  const name = (id: string | null) => (id === c.challengerId ? c.challenger.name : id === c.opponentId ? c.opponent.name : "");
  const fields = (move: string, winnerId?: string) => ({ id: c.id, move, ...(winnerId ? { winnerId } : {}) });

  return (
    <Card className="space-y-3">
      <div>
        <Badge tone={TONE[c.status]}>{CHALLENGE_STATUS_LABEL[c.status]}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Side person={c.challenger} won={c.winnerId === c.challengerId} />
        <span className="shrink-0 text-xs font-semibold text-slate-400">VS</span>
        <Side person={c.opponent} won={c.winnerId === c.opponentId} />
      </div>
      <p className="font-medium">“{c.description}”</p>
      <p className="text-xs text-slate-500">
        Indsats {fineUnits(c.units)} ({kr(c.units * finePriceKr)}) · {relativeDay(c.createdAt)}
        {c.match && ` · ${c.match.opponent ?? c.match.title}`}
      </p>

      {c.status === "SETTLED" && c.winnerId && (
        <p className="text-sm">
          🏆 <strong>{name(c.winnerId)}</strong> vandt — {name(c.winnerId === c.challengerId ? c.opponentId : c.challengerId)} har
          fået bøden.
        </p>
      )}
      {c.status === "ACCEPTED" && c.claimedById && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {name(c.claimedById)} melder <strong>{name(c.claimedWinnerId)}</strong> som vinder.
          {moves.includes("confirm") ? " Er du enig?" : " Venter på bekræftelse."}
        </p>
      )}

      {moves.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {moves.includes("accept") && <ActionButton action={moveChallenge} fields={fields("accept")} label="Accepter" variant="primary" />}
          {moves.includes("decline") && <ActionButton action={moveChallenge} fields={fields("decline")} label="Afvis" />}
          {moves.includes("cancel") && <ActionButton action={moveChallenge} fields={fields("cancel")} label="Træk tilbage" variant="ghost" />}
          {moves.includes("claim") && (
            <>
              <ActionButton action={moveChallenge} fields={fields("claim", viewerId)} label="Jeg vandt" variant="primary" />
              <ActionButton
                action={moveChallenge}
                fields={fields("claim", viewerId === c.challengerId ? c.opponentId : c.challengerId)}
                label={`${name(viewerId === c.challengerId ? c.opponentId : c.challengerId)} vandt`}
              />
            </>
          )}
          {moves.includes("confirm") && <ActionButton action={moveChallenge} fields={fields("confirm")} label="Bekræft" variant="primary" />}
          {moves.includes("dispute") && <ActionButton action={moveChallenge} fields={fields("dispute")} label="Uenig" />}
          {moves.includes("settle") && !moves.includes("claim") && (
            <>
              <ActionButton action={moveChallenge} fields={fields("settle", c.challengerId)} label={`Afgør: ${c.challenger.name} vandt`} variant="ghost" />
              <ActionButton action={moveChallenge} fields={fields("settle", c.opponentId)} label={`Afgør: ${c.opponent.name} vandt`} variant="ghost" />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Side({ person, won }: { person: Person; won: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={person.name} photoId={person.photoId} size="xs" />
      <span className={`truncate text-sm ${won ? "font-semibold" : ""}`}>
        {person.name}
        {won && " 🏆"}
      </span>
    </span>
  );
}
