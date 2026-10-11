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

const SIZES = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-lg" } as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** A person (or a team): their picture, else their initials on the team's tint. */
export function Avatar({
  name,
  photoId,
  size = "md",
  className = "",
}: {
  name: string;
  photoId?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`accent-tint-bg inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-[var(--accent-text)] ${SIZES[size]} ${className}`}
    >
      {photoId ? <Photo photoId={photoId} alt="" size="thumb" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}
