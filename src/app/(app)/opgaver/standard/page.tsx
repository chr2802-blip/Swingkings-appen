import { redirect } from "next/navigation";
import { requireTeamUser } from "@/lib/auth";
import { canAdministerTeam } from "@/lib/access";
import { teamDb } from "@/lib/team-db";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { TemplateDialog } from "@/components/template-dialog";
import { ActionButton } from "@/components/action-button";
import { deleteTaskTemplate } from "@/app/actions/matches";

export default async function TemplatesPage() {
  const user = await requireTeamUser();
  if (!canAdministerTeam(user, user.teamId)) redirect("/opgaver");
  const templates = await teamDb(user.teamId).taskTemplate.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div>
      <PageHeader
        title="Standardopgaver"
        description="Opgaver som hver kamp skal have. De tilføjes automatisk til nye kampe fra KampKlar og fordeles retfærdigt — dem med færrest opgaver først."
        action={<TemplateDialog />}
      />
      <Tabs
        current="/opgaver/standard"
        items={[
          { href: "/opgaver", label: "Mine" },
          { href: "/opgaver?vis=alle", label: "Alle åbne" },
          { href: "/opgaver?vis=udfort", label: "Udført" },
          { href: "/opgaver/standard", label: "Standardopgaver" },
        ]}
      />
      {templates.length === 0 ? (
        <EmptyState icon="🧺">Ingen standardopgaver endnu. Fx tøjvask, frugt og kørsel.</EmptyState>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.people === 1 ? "1 person" : `${t.people} personer`}
                    {t.description && ` · ${t.description}`}
                  </p>
                </div>
                <TemplateDialog template={t} />
                <ActionButton
                  action={deleteTaskTemplate}
                  fields={{ id: t.id }}
                  label="Slet"
                  variant="ghost"
                  confirm={`Slet “${t.title}”?`}
                  confirmLabel="Slet"
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
