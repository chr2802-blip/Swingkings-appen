import { redirect } from "next/navigation";

/** Old links (and notifications already sent) to a match open the activity. */
export default async function OldMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/aktiviteter/${encodeURIComponent(id)}`);
}
