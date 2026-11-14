import { payLink, paymentMessage, type PayKind } from "@/lib/pay";

/**
 * "Betal": opens MobilePay on the team's box with the amount and the message already
 * filled in ("Bøder – Anna"). Nothing here marks anything paid (`src/lib/pay.ts`).
 */
export function PayLink({
  kind,
  link,
  amountKr,
  name,
  className,
  children,
}: {
  kind: PayKind;
  /** The team's box, as its pay-in link. */
  link: string;
  /** Null when the team has not said what kontingent costs: the payer types it. */
  amountKr: number | null;
  /** Whoever pays, as the message names them. */
  name: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={payLink(link, amountKr, paymentMessage(kind, name))} className={className}>
      {children}
    </a>
  );
}
