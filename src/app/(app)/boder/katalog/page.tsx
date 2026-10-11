import { requireTeamUser } from "@/lib/auth";
import { canManageFines } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { prisma } from "@/lib/prisma";
import { fineUnits, kr } from "@/lib/money";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FinesTabs } from "@/components/fines-tabs";
import { FineTypeDialog } from "@/components/fine-type-dialog";
import { ActionButton } from "@/components/action-button";
import { removeFineType } from "@/app/actions/fines";

export default async function CataloguePage() {
  const user = await requireTeamUser();
  const manages = canManageFines(user, user.teamId);
  const [team, types] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { finePriceKr: true } }),
    teamDb(user.teamId).fineType.findMany({ where: { archivedAt: null }, orderBy: [{ units: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader
        title="Bødekatalog"
        description={`Hvad koster hvad. 1 bøde = ${kr(team.finePriceKr)}.`}
        action={manages && <FineTypeDialog finePriceKr={team.finePriceKr} />}
      />
      <FinesTabs current="/boder/katalog" />
      {types.length === 0 ? (
        <EmptyState icon="📜">
          {manages ? "Kataloget er tomt. Opret holdets bøder, så er de klar, når der skal deles ud." : "Kataloget er tomt endnu."}
        </EmptyState>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {types.map((type) => (
              <li key={type.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{type.name}</p>
                  {type.description && <p className="text-xs text-slate-500">{type.description}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{fineUnits(type.units)}</p>
                  <p className="text-xs text-slate-500">{kr(type.units * team.finePriceKr)}</p>
                </div>
                {manages && (
                  <div className="flex">
                    <FineTypeDialog finePriceKr={team.finePriceKr} fineType={type} />
                    <ActionButton
                      action={removeFineType}
                      fields={{ id: type.id }}
                      label="Fjern"
                      variant="ghost"
                      confirm={`Fjern “${type.name}” fra kataloget?`}
                      confirmLabel="Fjern"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
