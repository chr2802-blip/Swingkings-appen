import Image from "next/image";
import Link from "next/link";
import { crestColours, crestInitials, fixtureSides, meetingTime, venueLabel } from "@/lib/fixture";
import { countdown, readInZone } from "@/lib/time";

/**
 * The day's match on the front page, shown on match day only, written as a fixture: the
 * home side on the left, the kick-off between the two crests, and when to meet. Ours is
 * the club's crest; the opponent's is the one the super admin put in (`clubLogos`), else
 * a shield drawn from their name (`src/lib/fixture.ts`).
 */
type FixtureMatch = { id: string; opponent: string; isHome: boolean | null; startsAt: Date; location: string | null; note: string | null };

export function FixtureCard({
  match,
  teamName,
  opponentLogo,
}: {
  match: FixtureMatch;
  teamName: string;
  /** The opponent's crest's address, when there is one. */
  opponentLogo?: string | null;
}) {
  const sides = fixtureSides(teamName, match.opponent, match.isHome);
  const meet = meetingTime(match.note);
  return (
    <Link
      href={`/aktiviteter/${match.id}`}
      aria-label={`Kampdag: ${sides[0]!.name} mod ${sides[1]!.name} kl. ${readInZone(match.startsAt, "HH:mm")}${meet ? `, mødetid ${meet}` : ""}`}
      className="press-card block overflow-hidden rounded-2xl shadow-sm"
    >
      <FixturePoster match={match} teamName={teamName} opponentLogo={opponentLogo} />
    </Link>
  );
}

/**
 * The poster itself: the two crests, the kick-off between them, home or away, and when to
 * meet. On the front page it is a link to the match; on the match's own page it heads the
 * details, with the team's comments under it.
 */
export function FixturePoster({
  match,
  teamName,
  opponentLogo,
  mapLink = false,
}: {
  match: FixtureMatch;
  teamName: string;
  opponentLogo?: string | null;
  /** The place as a link to the map — only where the poster is not itself a link. */
  mapLink?: boolean;
}) {
  const sides = fixtureSides(teamName, match.opponent, match.isHome);
  const left = countdown(match.startsAt);
  const venue = venueLabel(match.isHome);
  const meet = meetingTime(match.note);
  return (
    <div className="fixture-poster">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 text-[11px] font-semibold tracking-[0.18em] uppercase">
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--gold)] px-2 py-0.5 text-slate-900">
          {left.matchday && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--star)]" />}
          {left.matchday ? "Kampdag" : left.text}
        </span>
        {venue && <span className="rounded-full border border-white/40 px-2 py-0.5">{venue}</span>}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-3 pb-2">
        {sides.map((side, index) => (
          <div key={side.name} className={`flex min-w-0 flex-col items-center gap-1.5 ${index === 1 ? "order-3" : ""}`}>
            {side.us ? <OurCrest /> : opponentLogo ? <ClubCrest src={opponentLogo} /> : <OpponentCrest name={side.name} />}
            <span className="font-display w-full truncate text-center text-sm leading-tight">{side.name}</span>
          </div>
        ))}
        <div className="order-2 flex flex-col items-center px-1">
          <span className="font-score text-4xl leading-none font-semibold">{readInZone(match.startsAt, "HH:mm")}</span>
          <span className="mt-1 text-[11px] tracking-wider uppercase opacity-80">{readInZone(match.startsAt, "EEE d. MMM")}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-black/15 px-4 py-2 text-xs">
        <span className="font-score text-base tracking-wide uppercase">{meet ? `Mødetid ${meet}` : left.text}</span>
        {match.location &&
          (mapLink ? (
            <a
              href={mapsHref(match.location)}
              target="_blank"
              rel="noopener noreferrer"
              className="press-text -my-2 block min-w-0 truncate py-2 underline-offset-2 opacity-90 hover:underline"
            >
              📍 {match.location} <span className="sr-only">(vis på kort)</span>
            </a>
          ) : (
            <span className="min-w-0 truncate opacity-85">📍 {match.location}</span>
          ))}
      </div>
    </div>
  );
}

/** A place, searched for on Google Maps. */
export function mapsHref(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/** A club's own crest, as the super admin put it in: kept whole, never cropped. */
function ClubCrest({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- served from a session-checked route.
  return <img src={src} alt="" className="h-14 w-14 object-contain drop-shadow-md" />;
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
