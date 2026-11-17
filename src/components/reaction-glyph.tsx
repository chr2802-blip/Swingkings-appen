import type { ReactionKind } from "@prisma/client";
import { Crown } from "@/components/crest";
import { REACTIONS } from "@/lib/reactions";

/** A reaction as it is drawn: the crown from the club's crest, or the emoji. Decorative; say it in words beside it. */
export function ReactionGlyph({ kind, size = "sm" }: { kind: ReactionKind; size?: "xs" | "sm" | "md" | "lg" }) {
  if (kind === "CROWN") {
    const box = { xs: "h-3.5 w-3.5", sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" }[size];
    return <Crown className={box} />;
  }
  const text = { xs: "text-[11px]", sm: "text-[13px]", md: "text-base", lg: "text-2xl" }[size];
  return (
    <span aria-hidden className={`leading-none ${text}`}>
      {REACTIONS.find((r) => r.kind === kind)!.emoji}
    </span>
  );
}
