/**
 * Showing a stored picture. Everything is served from `/api/photos/<id>` behind the
 * session, in the size the place needs: a feed of twenty asks for thumbnails.
 * A plain <img>: Next's optimiser would fetch without the browser's cookies.
 */
export function photoUrl(photoId: string, size: "full" | "thumb" = "full") {
  return size === "thumb" ? `/api/photos/${photoId}?size=thumb` : `/api/photos/${photoId}`;
}

export function Photo({
  photoId,
  alt,
  size = "full",
  className = "",
}: {
  photoId: string;
  alt: string;
  size?: "full" | "thumb";
  className?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element -- served from a session-checked route.
  return <img src={photoUrl(photoId, size)} alt={alt} loading="lazy" decoding="async" className={className} />;
}

const SIZES = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-lg", xl: "h-28 w-28 text-3xl" } as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/**
 * A person (or a team): their picture; else, for somebody with a shirt number, their shirt
 * in the team's colour with the number on its back; else their initials on the team's tint.
 */
export function Avatar({
  name,
  photoId,
  shirtNumber,
  size = "md",
  className = "",
}: {
  name: string;
  photoId?: string | null;
  shirtNumber?: number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-shirt={!photoId && shirtNumber != null ? shirtNumber : undefined}
      className={`accent-tint-bg inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-[var(--accent-text)] ${SIZES[size]} ${className}`}
    >
      {photoId ? (
        <Photo photoId={photoId} alt="" size="thumb" className="h-full w-full object-cover" />
      ) : shirtNumber != null ? (
        <Shirt number={shirtNumber} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** A football shirt seen from the back, filling its round frame, with the number on it. */
export function Shirt({ number, className = "h-[86%] w-[86%] translate-y-[6%]" }: { number: number; className?: string }) {
  const digits = String(number);
  return (
    <svg viewBox="0 0 40 40" className={className}>
      <path
        d="M14 4h12l3 2 9 6-4 8-5-3v19H11V17l-5 3-4-8 9-6 3-2Z"
        fill="var(--accent)"
        stroke="var(--accent-hover)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M15 4.2c1 2 3 3.2 5 3.2s4-1.2 5-3.2" fill="none" stroke="var(--stripe-a, #fff)" strokeWidth="1.6" />
      <text
        x="20"
        y="29"
        textAnchor="middle"
        fill="#fffffb"
        fontSize={digits.length > 1 ? 15 : 17}
        fontWeight="600"
        style={{ fontFamily: "var(--font-score), sans-serif" }}
      >
        {digits}
      </text>
    </svg>
  );
}
