"use client";

import { isNotAllowed } from "@/lib/not-allowed";
import { Button, ButtonLink, EmptyState } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (isNotAllowed(error)) {
    return (
      <EmptyState icon="🚫">
        <p className="mb-4">Det her hører til et andet hold, eller du har ikke lov til det.</p>
        <ButtonLink href="/oversigt" variant="secondary">
          Til oversigten
        </ButtonLink>
      </EmptyState>
    );
  }
  return (
    <EmptyState icon="🤕">
      <p className="mb-4">Noget gik galt. Prøv igen.</p>
      <Button onClick={reset}>Prøv igen</Button>
    </EmptyState>
  );
}
