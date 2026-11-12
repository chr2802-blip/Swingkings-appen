/**
 * Grey placeholders shown while a page's data is on its way, so a tap answers at once
 * instead of leaving the old page standing until the server is done.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />;
}

export function FeedSkeleton() {
  return (
    <section className="mx-auto max-w-xl space-y-6" aria-busy="true" aria-label="Indlæser feed">
      <SkeletonBlock className="h-6 w-24" />
      <SkeletonBlock className="h-72" />
      <SkeletonBlock className="h-40" />
    </section>
  );
}
