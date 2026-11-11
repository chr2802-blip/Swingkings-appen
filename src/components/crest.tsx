/**
 * Pieces of the club's crest, drawn small enough to sit in a line of text: the lightning
 * bolts beside the ring, the red star on the crown, and the crown itself. Decorative —
 * each is hidden from screen readers, so whatever it sits beside must say it in words.
 */

export function Bolt({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`}>
      <path d="M14.5 2 4 13.5h6.2L8.5 22 20 9.8h-6.4L14.5 2Z" fill="var(--gold)" stroke="var(--gold-deep)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Star({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`}>
      <path
        d="M12 1.5 13.6 8l5.6-3.6-3.3 5.9 6.6.9-6.3 2.3 4.4 5.2-6.2-2.6-.4 6.8-2.3-6.4-4.8 4.8 1.8-6.6-6.6.4 5.6-3.7L3.4 6.8 9.6 8.4 12 1.5Z"
        fill="var(--star)"
      />
    </svg>
  );
}

export function Crown({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`}>
      <path
        d="M3 6.5 7.5 12 12 3l4.5 9L21 6.5 19 20H5L3 6.5Z"
        fill="var(--gold)"
        stroke="var(--gold-deep)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m12 12.2.8 2 2-.5-1.4 1.5 1.2 1.7-2-.8-.6 2-.6-2-2 .8 1.2-1.7-1.4-1.5 2 .5.8-2Z" fill="var(--star)" />
    </svg>
  );
}

/**
 * This month's bødekonge(r): the crown, their names and what it cost them. When nobody
 * has been fined yet this month the throne stands empty.
 */
export function FineKing({ names, amount, month }: { names: string[]; amount: string; month: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--gold)] bg-[var(--gold-tint)] px-5 py-4 shadow-sm">
      <Crown className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wider text-slate-600 uppercase">Månedens bødekonge</p>
        {names.length > 0 ? (
          <>
            <p className="font-display truncate text-xl">{names.join(" & ")}</p>
            <p className="text-sm text-slate-600">
              {names.length > 1 ? `har hver ${amount} i bøder i ${month} og deler tronen` : `har ${amount} i bøder i ${month}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">Ingen bøder i {month} endnu. Tronen er ledig.</p>
        )}
      </div>
    </div>
  );
}

/** The crest's vertical stripes, as a band under the header. */
export function StripeBand({ className = "h-1.5" }: { className?: string }) {
  return <div aria-hidden className={`stripes-fine ${className}`} />;
}
