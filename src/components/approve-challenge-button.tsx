"use client";

import { ActionButton } from "@/components/action-button";
import { useShowFresh } from "@/components/fresh";
import { moveChallenge } from "@/app/actions/fines";

/** "Godkend" on a challenge: once it has gone through, the history shows the two fines it moved. */
export function ApproveChallengeButton({ id }: { id: string }) {
  const show = useShowFresh();
  return (
    <ActionButton
      action={moveChallenge}
      fields={{ id, move: "approve" }}
      label="Godkend"
      variant="primary"
      onDone={(result) => void show(result, "history")}
    />
  );
}
