import { requireTeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { teamRoster } from "@/lib/roster";
import { matchOptions } from "@/lib/fine-data";
import { movesFor } from "@/lib/challenges";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { FinesTabs } from "@/components/fines-tabs";
import { ChallengeCard } from "@/components/challenge-card";
import { ChallengeDialog } from "@/components/challenge-dialog";

const person = { select: { id: true, name: true, photoId: true } } as const;

export default async function ChallengesPage() {
  const user = await requireTeamUser();
  const manages = canManageFines(user, user.teamId);
  const db = teamDb(user.teamId);
  const [team, roster, matches, open, closed] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { finePriceKr: true } }),
    teamRoster(user.teamId),
    matchOptions(user.teamId),
    db.challenge.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED"] } },
      orderBy: { createdAt: "desc" },
      include: { challenger: person, opponent: person, match: { select: { opponent: true, title: true } } },
    }),
    db.challenge.findMany({
      where: { status: { in: ["SETTLED", "DECLINED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { challenger: person, opponent: person, match: { select: { opponent: true, title: true } } },
    }),
  ]);

  // What is waiting on the viewer goes first: it is the reason they opened the page.
  const waiting = open.filter((c) => movesFor(c, user.id, false).some((m) => m !== "cancel"));
  const others = open.filter((c) => !waiting.includes(c));
  const card = (c: (typeof open)[number]) => (
    <ChallengeCard key={c.id} challenge={c} viewerId={user.id} managesFines={manages} finePriceKr={team.finePriceKr} />
  );

  return (
    <div>
      <PageHeader
        title="Udfordringer"
        description="Udfordr en holdkammerat om bøder. Taberen betaler indsatsen til kassen."
        action={
          <ChallengeDialog
            opponents={roster.filter((m) => m.userId !== user.id)}
            finePriceKr={team.finePriceKr}
            matches={matches}
          />
        }
      />
      <FinesTabs current="/boder/udfordringer" />

      {waiting.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Venter på dig</SectionTitle>
          <div className="space-y-3">{waiting.map(card)}</div>
        </section>
      )}
      <section className="mb-8">
        <SectionTitle>Igangværende</SectionTitle>
        {others.length === 0 ? (
          <EmptyState icon="⚔️">Ingen åbne udfordringer. Hvem tør?</EmptyState>
        ) : (
          <div className="space-y-3">{others.map(card)}</div>
        )}
      </section>
      {closed.length > 0 && (
        <section>
          <SectionTitle>Afsluttede</SectionTitle>
          <div className="space-y-3">{closed.map(card)}</div>
        </section>
      )}
    </div>
  );
}
