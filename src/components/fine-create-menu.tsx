import { CreateMenu } from "@/components/create-button";
import { GiveFineDialog } from "@/components/give-fine-dialog";
import { ChallengeDialog } from "@/components/challenge-dialog";

type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

/**
 * The fine box's "+": a drawer with a fine to give and a challenge to report. The same on
 * every page of the tab — the overview, its swipe pages and the challenges.
 */
export function FineCreateMenu({
  viewerId,
  members,
  fineTypes,
  finePriceKr,
  matches,
}: {
  viewerId: string;
  members: Member[];
  fineTypes: { id: string; name: string; units: number }[];
  finePriceKr: number;
  matches: { id: string; label: string }[];
}) {
  return (
    <CreateMenu>
      <GiveFineDialog members={members} fineTypes={fineTypes} finePriceKr={finePriceKr} matches={matches} />
      <ChallengeDialog opponents={members.filter((m) => m.userId !== viewerId)} finePriceKr={finePriceKr} matches={matches} />
    </CreateMenu>
  );
}
