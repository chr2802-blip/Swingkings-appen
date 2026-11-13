import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { teamRoster } from "@/lib/roster";
import { matchOptions } from "@/lib/fine-data";
import { waitsOn } from "@/lib/challenges";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { ChallengeCard, challengeCardInclude } from "@/components/challenge-card";
import { ChallengeDialog } from "@/components/challenge-dialog";

export default async function ChallengesPage() {
  const user = await requireTeamUser();
  const manages = canManageFines(user, user.teamId);
  const db = teamDb(user.teamId);
  const [team, roster, matches, open, closed] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { finePriceKr: true } }),
    teamRoster(user.teamId),
    matchOptions(user.teamId),
    db.challenge.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: challengeCardInclude,
    }),
    db.challenge.findMany({
      where: { status: { in: ["SETTLED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: challengeCardInclude,
    }),
  ]);

  // What is waiting on the viewer goes first: it is the reason they opened the page.
  const waiting = open.filter((c) => waitsOn(c, user.id));
  const others = open.filter((c) => !waiting.includes(c));
  const card = (c: (typeof open)[number]) => (
    <ChallengeCard key={c.id} challenge={c} viewerId={user.id} managesFines={manages} finePriceKr={team.finePriceKr} />
  );

  return (
    <div>
      <Link href="/boder" className="mb-2 inline-block text-sm font-medium text-[var(--accent-text)]">
        ‹ Bødekassen
      </Link>
      <PageHeader
        title="Udfordringer"
        description="Udfordr dig ud af dine bøder. Meld resultatet, en anden godkender, og taberen overtager indsatsen."
        action={
          <ChallengeDialog
            opponents={roster.filter((m) => m.userId !== user.id)}
            finePriceKr={team.finePriceKr}
            matches={matches}
          />
        }
      />

      {waiting.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Venter på din godkendelse</SectionTitle>
          <div className="space-y-3">{waiting.map(card)}</div>
        </section>
      )}
      <section className="mb-8">
        <SectionTitle>Dine meldinger</SectionTitle>
        {others.length === 0 ? (
          <EmptyState icon="⚔️">Ingen udfordringer venter. Hvem tør?</EmptyState>
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
