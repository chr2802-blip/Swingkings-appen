import Link from "next/link";
import { requireTeamUser } from "@/lib/auth";
import { fineHistory } from "@/lib/fine-data";
import { EmptyState, PageHeader } from "@/components/ui";
import { FineHistory } from "@/components/fine-history";

/** As far back as the page goes. A team gives a few fines a week, so this is years. */
const SHOWN = 200;

export default async function FineHistoryPage() {
  const user = await requireTeamUser();
  const fines = await fineHistory(user.teamId, SHOWN);

  return (
    <div>
      <Link href="/boder" className="mb-2 inline-block text-sm font-medium text-[var(--accent-text)]">
        ‹ Bødekassen
      </Link>
      <PageHeader title="Historik" description="Alle holdets bøder, de nyeste først." />
      {fines.length === 0 ? (
        <EmptyState icon="😇">Ingen bøder endnu. Det varer nok ikke længe.</EmptyState>
      ) : (
        <FineHistory fines={fines} user={user} />
      )}
    </div>
  );
}
