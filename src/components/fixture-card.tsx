import Image from "next/image";
import Link from "next/link";
import { crestColours, crestInitials, fixtureSides, venueLabel } from "@/lib/fixture";
import { countdown, readInZone } from "@/lib/time";

/**
 * The next match on the front page, written as a fixture: the home side on the left, the
 * kick-off between the two crests, and how long there is to go. On the day itself it says
 * KAMPDAG in the crest's gold. Ours is the club's crest; the opponent's is drawn from
 * their name (`src/lib/fixture.ts`).
 */
export function FixtureCard({
  match,
  teamName,
}: {
  match: { id: string; opponent: string; isHome: boolean | null; startsAt: Date; location: string | null };
  teamName: string;
}) {
  const sides = fixtureSides(teamName, match.opponent, match.isHome);
  const left = countdown(match.startsAt);
  const venue = venueLabel(match.isHome);
  return (
    <Link
      href={`/aktiviteter/${match.id}`}
      aria-label={`Næste kamp: ${sides[0]!.name} mod ${sides[1]!.name}, ${left.text.toLowerCase()} kl. ${readInZone(match.startsAt, "HH:mm")}`}
      className="fixture-poster press-card block overflow-hidden rounded-2xl shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3 text-[11px] font-semibold tracking-[0.18em] uppercase">
        {left.matchday ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--gold)] px-2 py-0.5 text-slate-900">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--star)]" />
            Kampdag
          </span>
        ) : (
          <span className="opacity-80">Næste kamp</span>
        )}
        {venue && <span className="rounded-full border border-white/40 px-2 py-0.5">{venue}</span>}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-3 pb-2">
        {sides.map((side, index) => (
          <div key={side.name} className={`flex min-w-0 flex-col items-center gap-1.5 ${index === 1 ? "order-3" : ""}`}>
            {side.us ? <OurCrest /> : <OpponentCrest name={side.name} />}
            <span className="font-display w-full truncate text-center text-sm leading-tight">{side.name}</span>
          </div>
        ))}
        <div className="order-2 flex flex-col items-center px-1">
          <span className="font-score text-4xl leading-none font-semibold">{readInZone(match.startsAt, "HH:mm")}</span>
          <span className="mt-1 text-[11px] tracking-wider uppercase opacity-80">{readInZone(match.startsAt, "EEE d. MMM")}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-black/15 px-4 py-2 text-xs">
        <span className="font-score text-base tracking-wide uppercase">{left.text}</span>
        {match.location && <span className="min-w-0 truncate opacity-85">📍 {match.location}</span>}
      </div>
    </Link>
  );
}

function OurCrest() {
  return <Image src="/logo.png" alt="" width={512} height={512} className="h-14 w-14 drop-shadow-md" />;
}

/** A shield with the opponent's letters on it, in colours their name always gets. */
export function OpponentCrest({ name, className = "h-14 w-14" }: { name: string; className?: string }) {
  const { field, text } = crestColours(name);
  const letters = crestInitials(name);
  return (
    <svg aria-hidden viewBox="0 0 48 56" className={`shrink-0 drop-shadow-md ${className}`}>
      <path d="M24 2 44 8v18c0 13-8.5 22-20 28C12.5 48 4 39 4 26V8l20-6Z" fill={field} stroke="#fffffb" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M8 11 24 6l16 5" fill="none" stroke={text} strokeOpacity="0.45" strokeWidth="1.5" />
      <text
        x="24"
        y="33"
        textAnchor="middle"
        fill={text}
        fontSize={letters.length > 3 ? 11 : 14}
        fontWeight="700"
        style={{ fontFamily: "var(--font-score), sans-serif", letterSpacing: "0.04em" }}
      >
        {letters}
      </text>
    </svg>
  );
}
